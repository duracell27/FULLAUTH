import { PrismaService } from '@/prisma/prisma.service'
import {
	BadRequestException,
	Injectable,
	NotFoundException
} from '@nestjs/common'
import { CreateExpenseDto } from './dto/CreateExpense.dto'
import { GroupMember, Prisma, SplitType } from '@prisma/client'
import { GroupMembersService } from '@/group-members/group-members.service'
import { InputJsonValue } from '@prisma/client/runtime/library'
import { round2 } from '@/libs/common/utils/round2'

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
		private readonly groupMembersService: GroupMembersService
	) {}

	async addExpense(
		dto: CreateExpenseDto,
		creatorId: string
	): Promise<ExpenseWithDetails | null> {
		// --- Попередня валідація логіки ---
		const totalPaid = dto.payers.reduce((sum, p) => sum + p.amount, 0)
		if (Math.abs(totalPaid - dto.amount) > 0.01) {
			throw new BadRequestException(
				'Сума платежів не збігається із загальною сумою витрати.'
			)
		}

		const isUserGroupMember =
			await this.groupMembersService.isUserGroupMember(
				creatorId,
				dto.groupId
			)
		if (!isUserGroupMember)
			throw new BadRequestException('You are not a member of this group')

		const members = await this.prismaService.groupMember.findMany({
			where: {
				groupId: dto.groupId
			}
		})

		// Перевірка, чи всі потрібні юзери і група існують (можна додати для надійності)

		// --- Основна логіка в транзакції ---
		return this.prismaService.$transaction(async tx => {
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
			return tx.expense.findUnique({
				where: { id: expense.id },
				include: {
					payers: true,
					splits: true
				}
			})
		})
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
				'Для поділу витрати необхідно вказати хоча б одного боржника.'
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
						'Сума відсотків для поділу має дорівнювати 100.'
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
						'Сума кастомних боргів не збігається із загальною сумою витрати.'
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
						'Загальна кількість часток для поділу має бути більшою за нуль.'
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
						'Сума екстра платежів не може перевищувати загальну суму витрати.'
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
					`Непідтримуваний тип поділу витрати.`
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
				`Кінцева розрахована сума боргів (${calculatedTotal.toFixed(2)}) не збігається із загальною сумою витрати (${dto.amount.toFixed(2)}).`
			)
		}

		return shares
	}

	public async getExpenseInfo(expenseId: string, userId: string) {
		// Крок 1: Робимо один запит, який одразу і знаходить витрату, і перевіряє доступ
		const expense = await this.prismaService.expense.findFirst({
			where: {
				id: expenseId,
				// Перевіряємо, чи існує в групі учасник з таким userId
				group: {
					members: {
						some: {
							userId: userId
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
				'Expense not found or you do not have permission to view it.'
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
			throw new NotFoundException('Expense not found.')
		}

		const isUserAdmin = await this.groupMembersService.isUserAdminOfGroup(
			userId,
			expense.groupId
		)
		const isCreator = expense.creatorId === userId

		if (!isUserAdmin && !isCreator) {
			throw new BadRequestException(
				'You are not admin of this group or the creator of the expense'
			)
		}

		await this.prismaService.expense.delete({
			where: {
				id: expenseId
			}
		})

		return true
	}

	public async getExpenseFormData(expenseId: string, userId: string) {
		const expense = await this.prismaService.expense.findUnique({
			where: { id: expenseId },
			select: { formData: true, groupId: true, creatorId: true }
		})

		if (!expense) {
			throw new NotFoundException('Expense not found.')
		}

		const isUserAdmin = await this.groupMembersService.isUserAdminOfGroup(
			userId,
			expense.groupId
		)
		const isCreator = expense.creatorId === userId

		if (!isUserAdmin && !isCreator) {
			throw new BadRequestException(
				'You can not edit this expense because you are not admin of this group or the creator of the expense'
			)
		}

		return expense.formData as InputJsonValue
	}

	public async editExpense(
		expenseId: string,
		userId: string,
		dto: CreateExpenseDto
	) {
		const expense = await this.prismaService.expense.findUnique({
			where: { id: expenseId },
			select: { formData: true, groupId: true, creatorId: true }
		})

		if (!expense) {
			throw new NotFoundException('Expense not found.')
		}

		const isUserAdmin = await this.groupMembersService.isUserAdminOfGroup(
			userId,
			expense.groupId
		)
		const isCreator = expense.creatorId === userId

		if (!isUserAdmin && !isCreator) {
			throw new BadRequestException(
				'You can not edit this expense because you are not admin of this group or the creator of the expense'
			)
		}

		await this.prismaService.expense.delete({
			where: { id: expenseId }
		})

		await this.addExpense(dto, userId)

		return true
	}
}
