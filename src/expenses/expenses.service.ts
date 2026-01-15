import { PrismaService } from '@/prisma/prisma.service'
import {
	BadRequestException,
	forwardRef,
	Inject,
	Injectable,
	NotFoundException
} from '@nestjs/common'
import { I18nService, I18nContext } from 'nestjs-i18n'
import { CreateExpenseDto } from './dto/CreateExpense.dto'
import { GroupMember, Prisma, SplitType } from '@prisma/client'
import { GroupMembersService } from '@/group-members/group-members.service'
import { round2 } from '@/libs/common/utils/round2'
import { NotificationsService } from '@/notifications/notifications.service'
import { GroupsService } from '@/groups/groups.service'

// Визначаємо тип, який буде повертатися
// Він має ТОЧНО відповідати запиту в `findUnique` (включаючи `include`)
type ExpenseWithDetails = Prisma.ExpenseGetPayload<{
	include: {
		payers: true
		splits: true
	}
}>

@Injectable()
export class ExpensesService {
	public constructor(
		private readonly prismaService: PrismaService,
		private readonly groupMembersService: GroupMembersService,
		private readonly notificationsService: NotificationsService,
		private readonly i18n: I18nService,
		@Inject(forwardRef(() => GroupsService))
		private readonly groupsService: GroupsService
	) {}

	async addExpense(
		dto: CreateExpenseDto,
		creatorId: string
	): Promise<ExpenseWithDetails | null> {
		// --- Попередня валідація логіки ---
		const totalPaid = dto.payers.reduce((sum, p) => sum + p.amount, 0)
		if (Math.abs(totalPaid - dto.amount) > 0.01) {
			throw new BadRequestException(
				this.i18n.t(
					'common.expenses.validation.payments_sum_mismatch',
					{ lang: I18nContext.current()?.lang }
				)
			)
		}

		const isUserGroupMember =
			await this.groupMembersService.isUserGroupMember(
				creatorId,
				dto.groupId
			)
		if (!isUserGroupMember)
			throw new BadRequestException(
				this.i18n.t('common.expenses.validation.not_group_member', {
					lang: I18nContext.current()?.lang
				})
			)

		const members = await this.prismaService.groupMember.findMany({
			where: {
				groupId: dto.groupId
			}
		})

		// Перевірка, чи всі потрібні юзери і група існують (можна додати для надійності)

		// --- Основна логіка в транзакції ---
		const expense = await this.prismaService.$transaction(async tx => {
			// 1. Створюємо саму витрату
			const expense = await tx.expense.create({
				data: {
					description: dto.description,
					amount: dto.amount,
					splitType: dto.splitType,
					photoUrl: dto.photoUrl,
					groupId: dto.groupId,
					date: dto.date,
					creatorId: creatorId,
					formData: JSON.parse(
						JSON.stringify(dto)
					) as Prisma.InputJsonValue
				}
			})

			// 2. Створюємо записи про те, хто платив (ExpensePayment)
			await tx.expensePayment.createMany({
				data: dto.payers.map(payer => ({
					expenseId: expense.id,
					payerId: payer.userId,
					amount: payer.amount
				}))
			})

			// 3. Розраховуємо, хто кому і скільки винен (це найскладніша частина)
			// Створюємо мапу балансів для всіх учасників
			const userBalances = new Map<string, number>()

			// Додаємо гроші на баланс тим, хто платив (вони "кредитори")
			for (const payer of dto.payers) {
				userBalances.set(
					payer.userId,
					(userBalances.get(payer.userId) || 0) + payer.amount
				)
			}

			// Розраховуємо частку боргу для кожного
			const debtorShares = this.calculateDebtorShares(dto, members)

			// Віднімаємо борги з балансів (вони "боржники")
			for (const [userId, share] of debtorShares.entries()) {
				userBalances.set(
					userId,
					(userBalances.get(userId) || 0) - share
				)
			}

			// 4. Генеруємо фінальні записи боргів (Debt)
			// Розділяємо користувачів на тих, хто винен (негативний баланс) і кому винні (позитивний баланс)
			const debtors: { userId: string; amount: number }[] = []
			const creditors: { userId: string; amount: number }[] = []

			for (const [userId, balance] of userBalances.entries()) {
				if (balance < -0.01) {
					// Боржники
					debtors.push({ userId, amount: -balance })
				} else if (balance > 0.01) {
					// Кредитори
					creditors.push({ userId, amount: balance })
				}
			}

			// Спрощуємо борги: кожен боржник віддає гроші кредиторам
			const debtsToCreate: Prisma.DebtCreateManyInput[] = []

			for (const debtor of debtors) {
				let debtAmountLeft = debtor.amount
				// Знаходимо оригінальні дані боржника з DTO для збереження
				const originalDebtorData = dto.debtors.find(
					d => d.userId === debtor.userId
				)

				for (const creditor of creditors) {
					if (creditor.amount <= 0 || debtAmountLeft <= 0) continue

					const paymentAmount = Math.min(
						debtAmountLeft,
						creditor.amount
					)

					debtsToCreate.push({
						expenseId: expense.id,
						debtorId: debtor.userId,
						creditorId: creditor.userId,
						amount: round2(paymentAmount),
						remaining: round2(paymentAmount), // Початково залишок дорівнює повній сумі
						// Зберігаємо параметри розрахунку для історії
						percentage: originalDebtorData?.percentage,
						shares: originalDebtorData?.shares
					})

					debtAmountLeft -= paymentAmount
					creditor.amount -= paymentAmount
				}
			}

			if (debtsToCreate.length > 0) {
				await tx.debt.createMany({
					data: debtsToCreate
				})
			}

			// Повертаємо створену витрату з усіма зв'язками
			const result = await tx.expense.findUnique({
				where: { id: expense.id },
				include: {
					payers: true,
					splits: true
				}
			})

			// Створюємо нотифікації для всіх учасників групи
			await this.createExpenseNotifications(
				expense.id,
				dto.groupId,
				dto.description,
				dto.amount
			)

			// Створюємо нотифікації для всіх нових боргів на основі debtsToCreate
			await this.createDebtNotificationsFromData(
				expense.id,
				dto.groupId,
				dto.description,
				debtsToCreate
			)

			return result
		})

		// Отримуємо simplificationExpenseId групи
		const group = await this.prismaService.groupEntity.findUnique({
			where: { id: dto.groupId },
			select: {
				simplificationExpenseId: true
			}
		})

		// Автоматично пересимпліфікуємо
		if (group?.simplificationExpenseId) {
			await this.groupsService.simplifyAllDebts(
				dto.groupId,
				group.simplificationExpenseId
			)
		}

		return expense
	}

	private calculateDebtorShares(
		dto: CreateExpenseDto,
		members: GroupMember[]
	): Map<string, number> {
		const shares = new Map<string, number>()
		const numDebtors = dto.debtors.length

		// Перевірка, чи є взагалі боржники
		if (numDebtors === 0) {
			throw new BadRequestException(
				this.i18n.t('common.expenses.validation.no_debtors', {
					lang: I18nContext.current()?.lang
				})
			)
		}

		switch (dto.splitType) {
			case SplitType.EQUAL: {
				// Рівномірний поділ загальної суми на всіх учасників.
				const equalShare = dto.amount / numDebtors
				dto.debtors.forEach(d => shares.set(d.userId, equalShare))
				break
			}

			case SplitType.PERCENTAGE: {
				// Поділ на основі відсотків.
				const totalPercentage = dto.debtors.reduce(
					(sum, d) => sum + (d.percentage || 0),
					0
				)
				if (Math.abs(totalPercentage - 100) > 0.1) {
					throw new BadRequestException(
						this.i18n.t(
							'expenses.validation.percentage_sum_invalid',
							{
								lang: I18nContext.current()?.lang
							}
						)
					)
				}
				dto.debtors.forEach(d => {
					const share = dto.amount * ((d.percentage || 0) / 100)
					shares.set(d.userId, share)
				})
				break
			}

			case SplitType.CUSTOM: {
				// Поділ на основі конкретних вказаних сум.
				const totalCustomSum = dto.debtors.reduce(
					(sum, d) => sum + (d.amount || 0),
					0
				)
				if (Math.abs(totalCustomSum - dto.amount) > 0.01) {
					throw new BadRequestException(
						this.i18n.t(
							'common.expenses.validation.custom_sum_mismatch',
							{ lang: I18nContext.current()?.lang }
						)
					)
				}
				dto.debtors.forEach(d => shares.set(d.userId, d.amount || 0))
				break
			}

			case SplitType.SHARES: {
				// Поділ на основі часток (shares).
				const totalShares = dto.debtors.reduce(
					(sum, d) => sum + (d.shares || 0),
					0
				)
				if (totalShares <= 0) {
					throw new BadRequestException(
						this.i18n.t(
							'common.expenses.validation.shares_invalid',
							{ lang: I18nContext.current()?.lang }
						)
					)
				}

				const costPerShare = dto.amount / totalShares
				dto.debtors.forEach(d => {
					const userShareAmount = costPerShare * (d.shares || 0)
					shares.set(d.userId, userShareAmount)
				})
				break
			}

			case SplitType.EXTRA: {
				// 1. Сумуємо всі екстра-внески від боржників, що прийшли в DTO.
				const totalExtraAmount = dto.debtors.reduce(
					(sum, d) => sum + (d.extraAmount || 0),
					0
				)

				if (totalExtraAmount > dto.amount) {
					throw new BadRequestException(
						this.i18n.t(
							'common.expenses.validation.extra_amount_exceeds',
							{ lang: I18nContext.current()?.lang }
						)
					)
				}

				if (members.length === 0) {
					// Уникаємо ділення на нуль, якщо в групі немає учасників.
					break
				}

				// 2. Визначаємо залишок суми та рівну частку для КОЖНОГО учасника групи.
				const remainingAmount = dto.amount - totalExtraAmount
				const equalShare = remainingAmount / members.length

				// 3. Створюємо мапу для швидкого доступу до екстра-внесків по userId.
				// Це ефективніше, ніж шукати в циклі.
				const extraAmountsMap = new Map<string, number>()
				dto.debtors.forEach(d => {
					if (d.extraAmount) {
						extraAmountsMap.set(d.userId, d.extraAmount)
					}
				})

				// 4. Проходимо по ВСІХ учасниках групи.
				members.forEach(member => {
					// Кожен учасник за замовчуванням отримує рівну частку.
					let finalUserDebt = equalShare

					// Перевіряємо, чи є для цього учасника екстра-внесок.
					if (extraAmountsMap.has(member.userId)) {
						// Якщо так, додаємо його до рівної частки.
						finalUserDebt += extraAmountsMap.get(member.userId)!
					}

					// Записуємо фінальну суму боргу для учасника.
					shares.set(member.userId, finalUserDebt)
				})

				break
			}

			default:
				// Обробка невідомого або непідтримуваного типу поділу.
				throw new BadRequestException(
					this.i18n.t(
						'common.expenses.validation.unsupported_split_type',
						{ lang: I18nContext.current()?.lang }
					)
				)
		}

		// Фінальна перевірка, що загальна сума боргів збігається з сумою витрати
		const calculatedTotal = Array.from(shares.values()).reduce(
			(sum, val) => sum + val,
			0
		)
		if (Math.abs(calculatedTotal - dto.amount) > 0.01) {
			// Ця помилка може виникнути через проблеми з округленням, вона важлива для цілісності даних
			throw new BadRequestException(
				this.i18n.t(
					'common.expenses.validation.calculated_sum_mismatch',
					{
						lang: I18nContext.current()?.lang,
						args: {
							calculatedTotal: calculatedTotal.toFixed(2),
							totalAmount: dto.amount.toFixed(2)
						}
					}
				)
			)
		}

		return shares
	}

	public async getExpenseInfo(expenseId: string, userId: string) {
		// Крок 1: Робимо один запит, який одразу і знаходить витрату, і перевіряє доступ
		const expense = await this.prismaService.expense.findFirst({
			where: {
				id: expenseId,
				// Перевіряємо, чи існує в групі учасник з таким userId та статусом ACCEPTED
				group: {
					members: {
						some: {
							userId: userId,
							status: 'ACCEPTED'
						}
					}
				}
			},
			include: {
				// Включаємо дані про творця і вибираємо лише потрібні поля
				creator: {
					select: {
						id: true,
						displayName: true,
						picture: true
					}
				},
				// Включаємо платників
				payers: {
					include: {
						// Для кожного платника включаємо дані користувача
						payer: {
							select: {
								id: true,
								displayName: true,
								picture: true
							}
						}
					}
				},
				// Включаємо борги (хто скільки винен)
				// Показуємо всі борги (в т.ч. неактивні), щоб бачити оригінальний розподіл витрати
				splits: {
					include: {
						// Для кожного боржника включаємо дані користувача
						debtor: {
							select: {
								id: true,
								displayName: true,
								picture: true
							}
						},
						creditor: {
							select: {
								id: true,
								displayName: true,
								picture: true
							}
						}
					}
				}
			}
		})

		// Крок 2: Якщо витрата не знайдена або у користувача немає доступу, кидаємо помилку
		if (!expense) {
			throw new NotFoundException(
				this.i18n.t('common.expenses.errors.not_found', {
					lang: I18nContext.current()?.lang
				})
			)
		}

		return expense
	}

	public async deleteExpense(expenseId: string, userId: string) {
		const expense = await this.prismaService.expense.findFirst({
			where: {
				id: expenseId
			}
		})

		if (!expense) {
			throw new NotFoundException(
				this.i18n.t('common.expenses.errors.not_found_simple', {
					lang: I18nContext.current()?.lang
				})
			)
		}

		const isUserAdmin = await this.groupMembersService.isUserAdminOfGroup(
			userId,
			expense.groupId
		)
		const isCreator = expense.creatorId === userId

		if (!isUserAdmin && !isCreator) {
			throw new BadRequestException(
				this.i18n.t('common.expenses.errors.not_admin_or_creator', {
					lang: I18nContext.current()?.lang
				})
			)
		}

		// Перевіряємо чи є платежі в групі
		// Платежі тепер незалежні від витрат, тому дозволяємо видаляти витрати
		// При наступній симпліфікації платежі будуть враховані
		// (Стара логіка: не можна було видалити витрату якщо є платежі по боргах цієї витрати)

		// Отримуємо simplificationExpenseId групи
		const group = await this.prismaService.groupEntity.findUnique({
			where: { id: expense.groupId },
			select: { isSimplified: true, simplificationExpenseId: true }
		})

		// Видаляємо витрату та всі пов'язані дані в транзакції
		await this.prismaService.$transaction(async tx => {
			// 1. Видаляємо всі борги пов'язані з витратою
			await tx.debt.deleteMany({
				where: { expenseId }
			})

			// 2. Видаляємо всі платежі пов'язані з витратою
			await tx.expensePayment.deleteMany({
				where: { expenseId }
			})

			// 3. Видаляємо саму витрату
			await tx.expense.delete({
				where: { id: expenseId }
			})
		})

		// 4. Ресимпліфікуємо борги
		if (group?.isSimplified && group.simplificationExpenseId) {
			await this.groupsService.simplifyAllDebts(
				expense.groupId,
				group.simplificationExpenseId
			)
		}

		return true
	}

	public async getExpenseFormData(expenseId: string, userId: string) {
		const expense = await this.prismaService.expense.findUnique({
			where: { id: expenseId },
			select: { formData: true, groupId: true, creatorId: true }
		})

		if (!expense) {
			throw new NotFoundException(
				this.i18n.t('common.expenses.errors.not_found_simple', {
					lang: I18nContext.current()?.lang
				})
			)
		}

		const isUserAdmin = await this.groupMembersService.isUserAdminOfGroup(
			userId,
			expense.groupId
		)
		const isCreator = expense.creatorId === userId

		if (!isUserAdmin && !isCreator) {
			throw new BadRequestException(
				this.i18n.t('common.expenses.errors.cannot_edit', {
					lang: I18nContext.current()?.lang
				})
			)
		}

		return expense.formData as Prisma.InputJsonValue
	}

	public async editExpense(
		expenseId: string,
		userId: string,
		dto: CreateExpenseDto
	) {
		const expense = await this.prismaService.expense.findUnique({
			where: { id: expenseId },
			select: { groupId: true, creatorId: true }
		})

		if (!expense) {
			throw new NotFoundException(
				this.i18n.t('common.expenses.errors.not_found_simple', {
					lang: I18nContext.current()?.lang
				})
			)
		}

		const isUserAdmin = await this.groupMembersService.isUserAdminOfGroup(
			userId,
			expense.groupId
		)
		const isCreator = expense.creatorId === userId

		if (!isUserAdmin && !isCreator) {
			throw new BadRequestException(
				this.i18n.t('common.expenses.errors.cannot_edit', {
					lang: I18nContext.current()?.lang
				})
			)
		}

		const members = await this.prismaService.groupMember.findMany({
			where: { groupId: dto.groupId }
		})

		await this.prismaService.$transaction(async tx => {
			// 0. Перед створенням/оновленням боргів — всі старі робимо неактуальними
			await tx.debt.updateMany({
				where: { expenseId },
				data: { isActual: false }
			})

			// 1. Оновлюємо саму витрату
			await tx.expense.update({
				where: { id: expenseId },
				data: {
					description: dto.description,
					amount: dto.amount,
					splitType: dto.splitType,
					photoUrl: dto.photoUrl,
					date: dto.date,
					formData: JSON.parse(
						JSON.stringify(dto)
					) as Prisma.InputJsonValue
				}
			})

			// 2. Оновлюємо платників (ExpensePayment)
			await tx.expensePayment.deleteMany({ where: { expenseId } })
			await tx.expensePayment.createMany({
				data: dto.payers.map(payer => ({
					expenseId,
					payerId: payer.userId,
					amount: payer.amount
				}))
			})

			// 3. Оновлюємо борги (Debt)
			const oldDebts: Awaited<ReturnType<typeof tx.debt.findMany>> =
				await tx.debt.findMany({ where: { expenseId } })
			const oldDebtsMap: Map<string, (typeof oldDebts)[number]> =
				new Map()
			for (const d of oldDebts) {
				oldDebtsMap.set(`${d.debtorId}|${d.creditorId}`, d)
			}

			// Розрахунок нових боргів (як у addExpense)
			const userBalances = new Map<string, number>()
			for (const payer of dto.payers) {
				userBalances.set(
					payer.userId,
					(userBalances.get(payer.userId) || 0) + payer.amount
				)
			}
			const debtorShares = this.calculateDebtorShares(dto, members)
			for (const [userId, share] of debtorShares.entries()) {
				userBalances.set(
					userId,
					(userBalances.get(userId) || 0) - share
				)
			}
			const debtors: { userId: string; amount: number }[] = []
			const creditors: { userId: string; amount: number }[] = []
			for (const [userId, balance] of userBalances.entries()) {
				if (balance < -0.01) {
					debtors.push({ userId, amount: -balance })
				} else if (balance > 0.01) {
					creditors.push({ userId, amount: balance })
				}
			}

			const processedDebts = new Set<string>()
			for (const debtor of debtors) {
				let debtAmountLeft = debtor.amount
				const originalDebtorData = dto.debtors.find(
					d => d.userId === debtor.userId
				)
				for (const creditor of creditors) {
					if (creditor.amount <= 0 || debtAmountLeft <= 0) continue
					const paymentAmount = Math.min(
						debtAmountLeft,
						creditor.amount
					)
					const key = `${debtor.userId}|${creditor.userId}`
					const oldDebt = oldDebtsMap.get(key)
					if (oldDebt) {
						// GroupPayment незалежні від боргів, тому не оновлюємо їх тут
						// Просто оновлюємо борг з новою сумою
						await tx.debt.update({
							where: { id: oldDebt.id },
							data: {
								amount: round2(paymentAmount),
								remaining: round2(paymentAmount),
								status: 'PENDING',
								percentage: originalDebtorData?.percentage,
								shares: originalDebtorData?.shares,
								extraAmount: originalDebtorData?.extraAmount,
								isActual: true
							}
						})
					} else {
						await tx.debt.create({
							data: {
								expenseId,
								debtorId: debtor.userId,
								creditorId: creditor.userId,
								amount: round2(paymentAmount),
								remaining: round2(paymentAmount),
								percentage: originalDebtorData?.percentage,
								shares: originalDebtorData?.shares,
								extraAmount: originalDebtorData?.extraAmount,
								status: 'PENDING',
								isActual: true
							}
						})
					}
					processedDebts.add(key)
					debtAmountLeft -= paymentAmount
					creditor.amount -= paymentAmount
				}
			}

			// Старі борги, яких більше немає у новій схемі
			// GroupPayment незалежні від боргів, тому просто видаляємо старі борги
			// Платежі залишаться в GroupPayment і будуть враховані при симпліфікації
			for (const oldDebt of oldDebts) {
				const key = `${oldDebt.debtorId}|${oldDebt.creditorId}`
				if (!processedDebts.has(key)) {
					await tx.debt.delete({ where: { id: oldDebt.id } })
				}
			}
		})

		// Створюємо нотифікації для нових боргів
		await this.createDebtNotifications(
			expenseId,
			dto.groupId,
			dto.description
		)

		// Отримуємо simplificationExpenseId групи
		const group = await this.prismaService.groupEntity.findUnique({
			where: { id: dto.groupId },
			select: {
				simplificationExpenseId: true
			}
		})

		// Автоматично пересимпліфікуємо
		if (group?.simplificationExpenseId) {
			await this.groupsService.simplifyAllDebts(
				dto.groupId,
				group.simplificationExpenseId
			)
		}

		return true
	}

	private async createExpenseNotifications(
		expenseId: string,
		groupId: string,
		description: string,
		amount: number
	): Promise<void> {
		try {
			// Отримуємо назву групи
			const group = await this.prismaService.groupEntity.findUnique({
				where: { id: groupId },
				select: { name: true }
			})

			if (!group) return

			// Отримуємо всіх учасників групи
			const members = await this.prismaService.groupMember.findMany({
				where: {
					groupId,
					status: 'ACCEPTED'
				},
				select: { userId: true }
			})

			// Створюємо нотифікації для всіх учасників
			for (const member of members) {
				await this.notificationsService.createExpenseAddedNotification(
					member.userId,
					expenseId,
					description,
					group.name,
					amount
				)
			}
		} catch (error) {
			// Логуємо помилку, але не зупиняємо основний процес
			console.error('Error creating expense notifications:', error)
		}
	}

	private async createDebtNotificationsFromData(
		expenseId: string,
		groupId: string,
		description: string,
		debtsData: Array<{
			debtorId: string
			creditorId: string
			amount: number
		}>
	): Promise<void> {
		try {
			// Групуємо борги по кредитору для відправки одного сповіщення
			const creditsByCreditor = new Map<string, number>()

			// Створюємо нотифікації для кожного боржника окремо
			for (const debtData of debtsData) {
				// Нотифікація для боржника
				await this.notificationsService.create({
					userId: debtData.debtorId,
					type: 'DEBT_CREATED',
					title: this.i18n.t(
						'common.expenses.notifications.new_debt.title',
						{ lang: I18nContext.current()?.lang }
					),
					message: this.i18n.t(
						'expenses.notifications.new_debt.message',
						{
							lang: I18nContext.current()?.lang,
							args: {
								amount: debtData.amount,
								expenseDescription: description
							}
						}
					),
					relatedDebtId: expenseId,
					relatedExpenseId: expenseId,
					metadata: {
						expenseDescription: description,
						amount: debtData.amount,
						isDebtor: true
					}
				})

				// Акумулюємо суми для кредиторів
				const currentAmount =
					creditsByCreditor.get(debtData.creditorId) || 0
				creditsByCreditor.set(
					debtData.creditorId,
					currentAmount + debtData.amount
				)
			}

			// Створюємо одне сповіщення для кожного кредитора про всі його кредити
			for (const [
				creditorId,
				totalAmount
			] of creditsByCreditor.entries()) {
				await this.notificationsService.create({
					userId: creditorId,
					type: 'DEBT_CREATED',
					title: this.i18n.t(
						'expenses.notifications.new_credit.title',
						{
							lang: I18nContext.current()?.lang
						}
					),
					message: this.i18n.t(
						'expenses.notifications.new_credit.message',
						{
							lang: I18nContext.current()?.lang,
							args: {
								amount: totalAmount,
								expenseDescription: description
							}
						}
					),
					relatedDebtId: expenseId,
					relatedExpenseId: expenseId,
					metadata: {
						expenseDescription: description,
						amount: totalAmount,
						isDebtor: false
					}
				})
			}
		} catch (error) {
			// Логуємо помилку, але не зупиняємо основний процес
			console.error('Error creating debt notifications from data:', error)
		}
	}

	private async createDebtNotifications(
		expenseId: string,
		groupId: string,
		description: string
	): Promise<void> {
		try {
			// Отримуємо всі борги для цієї витрати
			const debts = await this.prismaService.debt.findMany({
				where: {
					expenseId,
					isActual: true
				},
				select: {
					id: true,
					debtorId: true,
					creditorId: true,
					amount: true,
					expenseId: true
				}
			})

			// Групуємо борги по кредитору для відправки одного сповіщення
			const creditsByCreditor = new Map<string, number>()

			// Створюємо нотифікації для кожного боржника окремо
			for (const debt of debts) {
				// Нотифікація для боржника
				await this.notificationsService.create({
					userId: debt.debtorId,
					type: 'DEBT_CREATED',
					title: this.i18n.t(
						'common.expenses.notifications.new_debt.title',
						{ lang: I18nContext.current()?.lang }
					),
					message: this.i18n.t(
						'expenses.notifications.new_debt.message',
						{
							lang: I18nContext.current()?.lang,
							args: {
								amount: debt.amount,
								expenseDescription: description
							}
						}
					),
					relatedDebtId: debt.id,
					relatedExpenseId: debt.expenseId,
					metadata: {
						expenseDescription: description,
						amount: debt.amount,
						isDebtor: true
					}
				})

				// Акумулюємо суми для кредиторів
				const currentAmount =
					creditsByCreditor.get(debt.creditorId) || 0
				creditsByCreditor.set(
					debt.creditorId,
					currentAmount + debt.amount
				)
			}

			// Створюємо одне сповіщення для кожного кредитора про всі його кредити
			for (const [
				creditorId,
				totalAmount
			] of creditsByCreditor.entries()) {
				await this.notificationsService.create({
					userId: creditorId,
					type: 'DEBT_CREATED',
					title: this.i18n.t(
						'expenses.notifications.new_credit.title',
						{
							lang: I18nContext.current()?.lang
						}
					),
					message: this.i18n.t(
						'expenses.notifications.new_credit.message',
						{
							lang: I18nContext.current()?.lang,
							args: {
								amount: totalAmount,
								expenseDescription: description
							}
						}
					),
					relatedDebtId: expenseId,
					relatedExpenseId: expenseId,
					metadata: {
						expenseDescription: description,
						amount: totalAmount,
						isDebtor: false
					}
				})
			}
		} catch (error) {
			// Логуємо помилку, але не зупиняємо основний процес
			console.error('Error creating debt notifications:', error)
		}
	}
}
