import { BadRequestException, Injectable } from '@nestjs/common'
import { CreateGroupDto } from './dto/CreateGroupDto'
import { CreatePersonalGroupDto } from './dto/CreatePersonalGroupDto'
import { PrismaService } from '@/prisma/prisma.service'
import { UpdateGroupDto } from './dto/UpdateGroupDto'
import { GroupMemberStatus, GroupRole } from '@prisma/client'
import { NotificationsService } from '../notifications/notifications.service'
import { I18nService, I18nContext } from 'nestjs-i18n'
import type { Prisma } from '@prisma/client'

type GroupWithMembers = {
	id: string
	name: string
	avatarUrl: string | null
	isLocked: boolean
	isFinished: boolean
	isPersonal: boolean
	totalExpenses: number
	userTotalExpenses: number
	userTotalBalance: number
	eventDate: Date
	createdAt: Date
	members: {
		userId: string
		role: GroupRole
		user: {
			id: string
			displayName: string
			picture: string | null
		}
	}[]
	memberBalanceDetails: {
		user: {
			id: string
			displayName: string
			picture: string | null
		}
		role: GroupRole
		totalBalance: number
		debtDetails: {
			user: {
				id: string
				displayName: string
				picture: string | null
			}
			amount: number
			type: 'owes_to_member' | 'member_owes_to'
		}[]
	}[]
}

@Injectable()
export class GroupsService {
	public constructor(
		private readonly prismaService: PrismaService,
		private readonly notificationsService: NotificationsService,
		private readonly i18n: I18nService
	) {}

	public async createGroup(userId: string, dto: CreateGroupDto) {
		return await this.prismaService.$transaction(async tx => {
			// Спочатку створюємо групу без simplificationExpenseId
			const group = await tx.groupEntity.create({
				data: {
					name: dto.name,
					avatarUrl: dto.avatarUrl,
					eventDate: dto.eventDate
				}
			})

			// Створюємо технічну витрату для спрощення боргів
			const systemExpense = await tx.expense.create({
				data: {
					groupId: group.id,
					creatorId: userId,
					description: 'Simplified debts',
					amount: 0,
					date: new Date()
				}
			})

			// Оновлюємо групу з simplificationExpenseId
			await tx.groupEntity.update({
				where: { id: group.id },
				data: {
					simplificationExpenseId: systemExpense.id
				}
			})

			await tx.groupMember.create({
				data: {
					userId: userId,
					groupId: group.id,
					role: GroupRole.ADMIN,
					status: GroupMemberStatus.ACCEPTED
				}
			})

			return group
		})
	}

	public async createPersonalGroup(
		userId: string,
		dto: CreatePersonalGroupDto
	) {
		// Перевіряємо, чи існує користувач, якого запрошуємо
		const invitedUser = await this.prismaService.user.findUnique({
			where: { id: dto.userId }
		})

		if (!invitedUser) {
			throw new BadRequestException(
				this.i18n.t('common.groups.errors.user_not_found', {
					lang: I18nContext.current()?.lang
				})
			)
		}

		// Перевіряємо, чи не є це той самий користувач
		if (userId === dto.userId) {
			throw new BadRequestException(
				this.i18n.t('common.groups.errors.cannot_create_with_self', {
					lang: I18nContext.current()?.lang
				})
			)
		}

		// Перевіряємо, чи вже не існує персональна група між цими користувачами
		const existingPersonalGroup =
			await this.prismaService.groupEntity.findFirst({
				where: {
					isPersonal: true,
					members: {
						every: {
							userId: {
								in: [userId, dto.userId]
							}
						}
					}
				},
				include: {
					members: {
						select: {
							userId: true
						}
					}
				}
			})

		if (existingPersonalGroup) {
			// Перевіряємо, чи група дійсно містить обох користувачів
			const memberIds = existingPersonalGroup.members.map(m => m.userId)
			if (memberIds.includes(userId) && memberIds.includes(dto.userId)) {
				throw new BadRequestException(
					this.i18n.t('common.groups.errors.personal_group_exists', {
						lang: I18nContext.current()?.lang
					})
				)
			}
		}

		// Створюємо персональну групу
		const group = await this.prismaService.groupEntity.create({
			data: {
				name: `Personal`,
				isPersonal: true,
				avatarUrl: '',
				eventDate: new Date()
			}
		})

		// Додаємо обох користувачів до групи
		await this.prismaService.groupMember.createMany({
			data: [
				{
					userId: userId,
					groupId: group.id,
					role: GroupRole.ADMIN,
					status: GroupMemberStatus.ACCEPTED
				},
				{
					userId: dto.userId,
					groupId: group.id,
					role: GroupRole.ADMIN,
					status: GroupMemberStatus.ACCEPTED
				}
			]
		})

		// Створюємо нотифікацію для запрошеного користувача
		const currentUser = await this.prismaService.user.findUnique({
			where: { id: userId },
			select: { displayName: true }
		})

		if (currentUser) {
			await this.notificationsService.createGroupInvitationNotification(
				dto.userId,
				group.id,
				group.name,
				currentUser.displayName
			)
		}

		return group
	}

	public async updateGroup(userId: string, dto: UpdateGroupDto) {
		//todo: check if user is admin of group
		const userGroupAdmin = await this.prismaService.groupMember.findFirst({
			where: {
				userId: userId,
				groupId: dto.groupId,
				role: 'ADMIN'
			}
		})

		if (!userGroupAdmin) {
			throw new BadRequestException(
				this.i18n.t('common.groups.errors.not_group_admin', {
					lang: I18nContext.current()?.lang
				})
			)
		}

		if (dto.isFinished === true) {
			// Перевіряємо, чи є невиплачені борги у групі з урахуванням платежів
			const allDebts = await this.prismaService.debt.findMany({
				where: {
					expense: {
						groupId: dto.groupId
					},
					isActual: true
				},
				select: {
					debtorId: true,
					creditorId: true,
					remaining: true
				}
			})

			// Отримуємо всі платежі в групі
			const allPayments = await this.prismaService.groupPayment.findMany({
				where: {
					groupId: dto.groupId
				},
				select: {
					fromId: true,
					toId: true,
					amount: true
				}
			})

			// Розраховуємо чистий баланс між користувачами
			const pairBalances = new Map<string, number>()

			// Додаємо борги до балансів
			for (const debt of allDebts) {
				const key = debt.debtorId + '->' + debt.creditorId
				pairBalances.set(
					key,
					(pairBalances.get(key) || 0) + debt.remaining
				)
			}

			// Віднімаємо платежі від балансів
			for (const payment of allPayments) {
				const key = payment.fromId + '->' + payment.toId
				pairBalances.set(
					key,
					(pairBalances.get(key) || 0) - payment.amount
				)
			}

			// Перевіряємо, чи є невиплачені борги (баланс > 0.01)
			const hasUnpaidDebts = Array.from(pairBalances.values()).some(
				balance => balance > 0.01
			)

			if (hasUnpaidDebts) {
				throw new BadRequestException(
					this.i18n.t(
						'common.groups.errors.cannot_finish_with_debts',
						{
							lang: I18nContext.current()?.lang
						}
					)
				)
			}
		}

		const group = await this.prismaService.groupEntity.update({
			where: {
				id: dto.groupId
			},
			data: {
				name: dto.name,
				avatarUrl: dto.avatarUrl,
				eventDate: dto.eventDate,
				isLocked: dto.isLocked,
				isFinished: dto.isFinished
			}
		})

		return group
	}

	public async deleteGroup(groupId: string, userId: string) {
		const userGroupAdmin = await this.prismaService.groupMember.findFirst({
			where: {
				userId: userId,
				groupId: groupId,
				role: 'ADMIN'
			}
		})

		const currentLang = I18nContext.current()?.lang

		if (!userGroupAdmin) {
			throw new BadRequestException(
				this.i18n.t('common.groups.errors.not_group_admin', {
					lang: currentLang
				})
			)
		}

		// Перевірка: групу можна видалити лише якщо вона завершена і немає невиплачених боргів
		const group = await this.prismaService.groupEntity.findFirst({
			where: { id: groupId },
			select: { isFinished: true }
		})
		if (!group?.isFinished) {
			throw new BadRequestException(
				this.i18n.t('common.groups.errors.can_only_delete_finished', {
					lang: currentLang
				})
			)
		}

		// Перевіряємо невиплачені борги з урахуванням платежів
		const allDebts = await this.prismaService.debt.findMany({
			where: {
				expense: {
					groupId: groupId
				},
				isActual: true
			},
			select: {
				debtorId: true,
				creditorId: true,
				remaining: true
			}
		})

		// Отримуємо всі платежі в групі
		const allPayments = await this.prismaService.groupPayment.findMany({
			where: {
				groupId: groupId
			},
			select: {
				fromId: true,
				toId: true,
				amount: true
			}
		})

		// Розраховуємо чистий баланс між користувачами
		const pairBalances = new Map<string, number>()

		// Додаємо борги до балансів
		for (const debt of allDebts) {
			const key = debt.debtorId + '->' + debt.creditorId
			pairBalances.set(key, (pairBalances.get(key) || 0) + debt.remaining)
		}

		// Віднімаємо платежі від балансів
		for (const payment of allPayments) {
			const key = payment.fromId + '->' + payment.toId
			pairBalances.set(key, (pairBalances.get(key) || 0) - payment.amount)
		}

		// Перевіряємо, чи є невиплачені борги (баланс > 0.01)
		const hasUnpaidDebts = Array.from(pairBalances.values()).some(
			balance => balance > 0.01
		)

		if (hasUnpaidDebts) {
			throw new BadRequestException(
				this.i18n.t('common.groups.errors.cannot_delete_with_debts', {
					lang: currentLang
				})
			)
		}

		await this.prismaService.groupEntity.delete({
			where: {
				id: groupId
			}
		})

		return true
	}

	public async getGroupInfo(
		groupId: string,
		userId: string
	): Promise<GroupWithMembers> {
		const group = await this.prismaService.groupEntity.findFirst({
			where: {
				id: groupId
			},
			select: {
				id: true,
				name: true,
				avatarUrl: true,
				eventDate: true,
				isLocked: true,
				isFinished: true,
				isSimplified: true,
				isPersonal: true,
				createdAt: true,
				members: {
					where: {
						status: {
							in: [
								GroupMemberStatus.PENDING,
								GroupMemberStatus.ACCEPTED
							]
						}
					},
					select: {
						userId: true,
						role: true,
						status: true,
						user: {
							select: {
								id: true,
								displayName: true,
								picture: true
							}
						}
					}
				},
				expenses: {
					where: {
						description: {
							not: 'Simplified debts'
						}
					},
					select: {
						id: true,
						amount: true,
						description: true,
						photoUrl: true,
						date: true,
						createdAt: true,
						creator: {
							select: {
								id: true,
								displayName: true,
								picture: true
							}
						},
						payers: {
							select: {
								payer: {
									select: {
										id: true,
										displayName: true,
										picture: true
									}
								}
							}
						},
						splits: {
							where: {
								OR: [
									{ debtorId: userId },
									{ creditorId: userId }
								]
								// Не фільтруємо по isActual - показуємо оригінальні борги для витрат
							},
							select: {
								amount: true,
								remaining: true,
								debtorId: true,
								creditorId: true,
								isActual: true
							}
						}
					},
					orderBy: {
						createdAt: 'desc'
					}
				}
			}
		})

		// Перевірка, чи існує група
		if (!group) {
			throw new BadRequestException(
				this.i18n.t('common.groups.errors.group_not_found', {
					lang: I18nContext.current()?.lang
				})
			)
		}

		// Явна перевірка, чи members є масивом (хоча тип гарантує, що це масив)
		if (!Array.isArray(group.members)) {
			throw new BadRequestException(
				this.i18n.t('common.groups.errors.members_not_defined', {
					lang: I18nContext.current()?.lang
				})
			)
		}

		// Перевірка, чи є користувач у групі з підтвердженим статусом
		const isMember = group.members.some(
			member =>
				member.userId === userId &&
				member.status === GroupMemberStatus.ACCEPTED
		)
		if (!isMember) {
			throw new BadRequestException(
				this.i18n.t('common.groups.errors.user_not_in_group', {
					lang: I18nContext.current()?.lang
				})
			)
		}

		// Обчислюємо баланс користувача для кожної витрати
		const expensesWithBalance = group.expenses.map(expense => {
			// В спрощеному режимі показуємо оригінальні борги (всі splits)
			// В звичайному режимі - тільки активні
			const activeSplits = group.isSimplified
				? expense.splits
				: expense.splits.filter(split => split.isActual)

			// Для балансу по витраті використовуємо amount (оригінальна частка),
			// а не remaining (поточний залишок), щоб показати участь в витраті
			const totalOwedToUser = activeSplits
				.filter(split => split.creditorId === userId)
				.reduce((sum, split) => sum + split.amount, 0)

			// Гроші, що поточний юзер винен іншим за цю витрату
			const totalOwedByUser = activeSplits
				.filter(split => split.debtorId === userId)
				.reduce((sum, split) => sum + split.amount, 0)

			// Баланс - це чистий результат: кому винні мінус що винні.
			// Якщо результат > 0, вам винні. Якщо < 0, ви винні.
			const userBalance = totalOwedToUser - totalOwedByUser

			return {
				id: expense.id,
				amount: expense.amount,
				description: expense.description,
				photoUrl: expense.photoUrl,
				date: expense.date,
				createdAt: expense.createdAt,
				creator: expense.creator,
				payers: expense.payers,
				userBalance // <-- використовуємо новий, правильно розрахований баланс
			}
		})

		// --- НОВИЙ КОД: Обчислення загальних сум ---

		// 1. Загальна сума всіх витрат у групі
		// Ми використовуємо початковий масив `group.expenses`,
		// оскільки там є повна сума кожної витрати.
		const totalExpenses = group.expenses.reduce(
			(sum, expense) => sum + expense.amount,
			0
		)

		// 2. Розраховуємо частку користувача у витратах групи
		// Формула: Ваші витрати = (Ваші платежі) - (Борги до вас) + (Ваші борги)

		// Сума платежів користувача
		const userPayments = await this.prismaService.expensePayment.aggregate({
			where: {
				payerId: userId,
				expense: {
					groupId: groupId,
					description: {
						not: 'Simplified debts'
					}
				}
			},
			_sum: {
				amount: true
			}
		})

		// Борги до користувача (він creditor)
		const debtsToUser = await this.prismaService.debt.aggregate({
			where: {
				creditorId: userId,
				expense: {
					groupId: groupId,
					description: {
						not: 'Simplified debts'
					}
				}
			},
			_sum: {
				amount: true
			}
		})

		// Борги користувача (він debtor)
		const debtsFromUser = await this.prismaService.debt.aggregate({
			where: {
				debtorId: userId,
				expense: {
					groupId: groupId,
					description: {
						not: 'Simplified debts'
					}
				}
			},
			_sum: {
				amount: true
			}
		})

		const userTotalExpenses =
			(userPayments._sum.amount || 0) -
			(debtsToUser._sum.amount || 0) +
			(debtsFromUser._sum.amount || 0)

		// --- НОВИЙ КОД: Обчислення балансів всіх учасників ---

		// Отримуємо всі активні борги в групі для розрахунку балансів учасників
		const allDebts = await this.prismaService.debt.findMany({
			where: {
				expense: {
					groupId: groupId
				},
				isActual: true
			},
			select: {
				debtorId: true,
				creditorId: true,
				remaining: true,
				isActual: true
			}
		})

		// Отримуємо всі GroupPayment в групі
		const groupPayments = await this.prismaService.groupPayment.findMany({
			where: { groupId: groupId },
			select: {
				id: true,
				fromId: true,
				toId: true,
				amount: true,
				createdAt: true,
				from: {
					select: {
						id: true,
						displayName: true,
						picture: true
					}
				},
				to: {
					select: {
						id: true,
						displayName: true,
						picture: true
					}
				},
				creator: {
					select: {
						id: true,
						displayName: true,
						picture: true
					}
				}
			}
		})

		// Агрегуємо платежі по напрямках
		type UserInfo = {
			id: string
			displayName: string
			picture: string | null
		}
		type PaymentDetail = {
			id: string
			creator: UserInfo
			amount: number
			createdAt: Date
		}
		type PaymentBetweenMembers = {
			from: UserInfo
			to: UserInfo
			amount: number
			payments: PaymentDetail[]
		}
		const paymentsMap = new Map<string, PaymentBetweenMembers>()

		for (const payment of groupPayments) {
			if (!payment.creator) continue // Пропускаємо платежі без creator

			const creator = payment.creator as UserInfo
			const key = payment.fromId + '->' + payment.toId

			const paymentDetail: PaymentDetail = {
				id: payment.id,
				creator: creator,
				amount: payment.amount,
				createdAt: payment.createdAt
			}

			if (paymentsMap.has(key)) {
				const existing = paymentsMap.get(key)!
				existing.amount += payment.amount
				existing.payments.push(paymentDetail)
			} else {
				paymentsMap.set(key, {
					from: payment.from as UserInfo,
					to: payment.to as UserInfo,
					amount: payment.amount,
					payments: [paymentDetail]
				})
			}
		}

		const paymentsBetweenMembers = Array.from(paymentsMap.values())

		// Створюємо Map для швидкого доступу до балансів учасників
		const memberBalances = new Map<string, number>()

		// Ініціалізуємо баланси всіх учасників нулем
		group.members.forEach(member => {
			memberBalances.set(member.userId, 0)
		})

		// Обчислюємо баланс кожного учасника (тільки на основі активних боргів)
		allDebts.forEach(debt => {
			// Тільки активні борги враховуються в балансах
			if (!debt.isActual) return

			// Кредитор отримує позитивний баланс (йому винні)
			const creditorBalance = memberBalances.get(debt.creditorId) || 0
			memberBalances.set(
				debt.creditorId,
				creditorBalance + debt.remaining
			)

			// Боржник отримує негативний баланс (він винен)

			const debtorBalance = memberBalances.get(debt.debtorId) || 0

			memberBalances.set(debt.debtorId, debtorBalance - debt.remaining)
		})

		// 2. Загальний баланс користувача по всій групі (на основі активних боргів)
		let userTotalBalance = memberBalances.get(userId) || 0

		// Коригуємо баланс з урахуванням платежів
		for (const payment of groupPayments) {
			if (payment.fromId === userId) {
				// Користувач заплатив комусь - збільшує його баланс (додаємо)
				userTotalBalance += payment.amount
			}
			if (payment.toId === userId) {
				// Комусь заплатили користувачу - зменшує його баланс (віднімаємо)
				userTotalBalance -= payment.amount
			}
		}

		// Створюємо Map для швидкого доступу до користувачів
		const usersMap = new Map<
			string,
			{ id: string; displayName: string; picture: string | null }
		>()
		for (const member of group.members) {
			usersMap.set(member.userId, member.user)
		}

		// Розраховуємо overpays (коли платежів більше ніж боргів)
		// Overpay виникає коли баланс між двома користувачами негативний
		// (тобто хтось переплатив через видалення витрат)
		type Overpay = {
			from: { id: string; displayName: string; picture: string | null }
			to: { id: string; displayName: string; picture: string | null }
			amount: number
			payments: PaymentDetail[]
		}
		const overpays: Overpay[] = []

		// Для кожної пари користувачів рахуємо чистий баланс з урахуванням платежів
		const pairBalances = new Map<string, number>()

		// Додаємо борги до балансів
		for (const debt of allDebts) {
			const key = debt.debtorId + '->' + debt.creditorId
			pairBalances.set(key, (pairBalances.get(key) || 0) + debt.remaining)
		}

		// Віднімаємо платежі від балансів
		for (const payment of groupPayments) {
			const key = payment.fromId + '->' + payment.toId
			pairBalances.set(key, (pairBalances.get(key) || 0) - payment.amount)
		}

		// Якщо баланс негативний - це overpay (платежів більше ніж боргів)
		for (const [key, balance] of pairBalances.entries()) {
			if (balance < -0.01) {
				// Витягуємо fromId і toId з ключа
				const [fromId, toId] = key.split('->')
				const fromUser = usersMap.get(fromId)
				const toUser = usersMap.get(toId)

				if (!fromUser || !toUser) continue

				// Знаходимо платежі для цієї пари
				const paymentsForPair = groupPayments.filter(
					p => p.fromId === fromId && p.toId === toId
				)

				// Збираємо всі деталі платежів
				const paymentDetails: PaymentDetail[] = paymentsForPair.map(
					p => ({
						id: p.id,
						creator: p.creator as UserInfo,
						amount: p.amount,
						createdAt: p.createdAt
					})
				)

				overpays.push({
					from: fromUser,
					to: toUser,
					amount: Math.abs(balance),
					payments: paymentDetails
				})
			}
		}

		// Створюємо структуру для акордеону з деталями боргів
		const memberBalanceDetails: Array<{
			user: {
				id: string
				displayName: string
				picture: string | null
			}
			role: GroupRole
			totalBalance: number
			debtDetails: Array<{
				user: {
					id: string
					displayName: string
					picture: string | null
				}
				amount: number
				type: 'owes_to_member' | 'member_owes_to'
			}>
		}> = []

		for (const member of group.members) {
			const memberBalance = memberBalances.get(member.userId) || 0

			// Розраховуємо скоригований баланс з урахуванням платежів
			let adjustedBalance = memberBalance
			for (const payment of groupPayments) {
				if (payment.fromId === member.userId) {
					// Member заплатив комусь - збільшує його баланс (додаємо)
					adjustedBalance += payment.amount
				}
				if (payment.toId === member.userId) {
					// Хтось заплатив member - зменшує його баланс (віднімаємо)
					adjustedBalance -= payment.amount
				}
			}

			// Додаємо тільки тих учасників, у яких баланс не дорівнює 0
			if (memberBalance !== 0) {
				// Знаходимо всі активні борги пов'язані з цим учасником
				const memberDebts = allDebts.filter(
					debt =>
						debt.isActual &&
						(debt.creditorId === member.userId ||
							debt.debtorId === member.userId)
				)

				// Групуємо борги по контрагентах
				const debtDetails = new Map<
					string,
					{
						user: {
							id: string
							displayName: string
							picture: string | null
						}
						amount: number
						type: 'owes_to_member' | 'member_owes_to'
					}
				>()

				memberDebts.forEach(debt => {
					if (debt.creditorId === member.userId) {
						// Цьому учаснику винні
						const existingDebt = debtDetails.get(debt.debtorId)
						const debtorUser = usersMap.get(debt.debtorId)
						if (!debtorUser) return

						if (existingDebt) {
							if (existingDebt.type === 'member_owes_to') {
								// Є взаємний борг, зачищуємо
								if (existingDebt.amount > debt.remaining) {
									existingDebt.amount -= debt.remaining
								} else if (
									existingDebt.amount < debt.remaining
								) {
									existingDebt.amount =
										debt.remaining - existingDebt.amount
									existingDebt.type = 'owes_to_member'
								} else {
									// Борги рівні, видаляємо запис
									debtDetails.delete(debt.debtorId)
								}
							} else {
								// Однотипний борг, додаємо
								existingDebt.amount += debt.remaining
							}
						} else {
							debtDetails.set(debt.debtorId, {
								user: debtorUser,
								amount: debt.remaining,
								type: 'owes_to_member'
							})
						}
					} else if (debt.debtorId === member.userId) {
						// Цей учасник винен
						const existingDebt = debtDetails.get(debt.creditorId)
						const creditorUser = usersMap.get(debt.creditorId)
						if (!creditorUser) return

						if (existingDebt) {
							if (existingDebt.type === 'owes_to_member') {
								// Є взаємний борг, зачищуємо
								if (existingDebt.amount > debt.remaining) {
									existingDebt.amount -= debt.remaining
								} else if (
									existingDebt.amount < debt.remaining
								) {
									existingDebt.amount =
										debt.remaining - existingDebt.amount
									existingDebt.type = 'member_owes_to'
								} else {
									// Борги рівні, видаляємо запис
									debtDetails.delete(debt.creditorId)
								}
							} else {
								// Однотипний борг, додаємо
								existingDebt.amount += debt.remaining
							}
						} else {
							debtDetails.set(debt.creditorId, {
								user: creditorUser,
								amount: debt.remaining,
								type: 'member_owes_to'
							})
						}
					}
				})

				// Віднімаємо платежі від боргів в деталях
				for (const payment of groupPayments) {
					// Якщо member заплатив комусь
					if (payment.fromId === member.userId) {
						const debtDetail = debtDetails.get(payment.toId)
						if (
							debtDetail &&
							debtDetail.type === 'member_owes_to'
						) {
							debtDetail.amount -= payment.amount
						}
					}
					// Якщо хтось заплатив member
					if (payment.toId === member.userId) {
						const debtDetail = debtDetails.get(payment.fromId)
						if (
							debtDetail &&
							debtDetail.type === 'owes_to_member'
						) {
							debtDetail.amount -= payment.amount
						}
					}
				}

				// Конвертуємо Map в масив і фільтруємо нульові борги
				const debtDetailsArray = Array.from(
					debtDetails.values()
				).filter(detail => detail.amount > 0.01)

				if (debtDetailsArray.length > 0) {
					memberBalanceDetails.push({
						user: member.user,
						role: member.role,
						totalBalance: adjustedBalance,
						debtDetails: debtDetailsArray
					})
				}
			}
		}

		return {
			...group,
			expenses: expensesWithBalance,
			totalExpenses,
			userTotalExpenses,
			userTotalBalance,
			memberBalanceDetails, // <-- Додано нове поле для акордеону
			paymentsBetweenMembers,
			overpays
		} as GroupWithMembers
	}

	public async isGroupExsist(groupId: string) {
		const group = await this.prismaService.groupEntity.findFirst({
			where: {
				id: groupId
			}
		})

		return !!group
	}

	public async getGroupName(groupId: string) {
		const group = await this.prismaService.groupEntity.findFirst({
			where: {
				id: groupId
			},
			select: {
				name: true
			}
		})

		if (group) {
			return group.name
		} else {
			return ''
		}
	}

	/**
	 * Включення режиму спрощення боргів для групи
	 * Викликається тільки адміном групи
	 * Незворотна операція!
	 */
	public async enableDebtSimplification(
		groupId: string,
		userId: string
	): Promise<{ success: boolean; debtsCount: number }> {
		// Перевірка: користувач є ADMIN
		const userGroupAdmin = await this.prismaService.groupMember.findFirst({
			where: {
				userId: userId,
				groupId: groupId,
				role: 'ADMIN'
			}
		})

		if (!userGroupAdmin) {
			throw new BadRequestException(
				this.i18n.t('common.groups.errors.not_group_admin', {
					lang: I18nContext.current()?.lang
				})
			)
		}

		// Перевірка: група ще не спрощена
		const group = await this.prismaService.groupEntity.findUnique({
			where: { id: groupId },
			select: { isSimplified: true }
		})

		if (!group) {
			throw new BadRequestException(
				this.i18n.t('common.groups.errors.group_not_found', {
					lang: I18nContext.current()?.lang
				})
			)
		}

		if (group.isSimplified) {
			throw new BadRequestException('Group debts are already simplified')
		}

		// Створити технічну витрату та включити режим
		return await this.prismaService.$transaction(async tx => {
			// Створюємо технічну витрату
			const systemExpense = await tx.expense.create({
				data: {
					groupId,
					creatorId: userId,
					amount: 0,
					description: 'Simplified debts',
					splitType: 'EQUAL',
					date: new Date()
				}
			})

			// Позначаємо групу як спрощену
			await tx.groupEntity.update({
				where: { id: groupId },
				data: {
					isSimplified: true,
					simplifiedAt: new Date(),
					simplifiedBy: userId,
					simplificationExpenseId: systemExpense.id
				}
			})

			// Спрощуємо всі існуючі борги (використовуємо поточну транзакцію)
			await this.simplifyDebtsInTransaction(tx, groupId, systemExpense.id)

			// Рахуємо кількість нових боргів
			const newDebtsCount = await tx.debt.count({
				where: {
					expenseId: systemExpense.id,
					isActual: true
				}
			})

			return { success: true, debtsCount: newDebtsCount }
		})
	}

	/**
	 * Пересимпліфікація всіх боргів у групі
	 * Викликається при включенні режиму та після кожної нової витрати
	 */
	public async simplifyAllDebts(
		groupId: string,
		systemExpenseId: string
	): Promise<void> {
		await this.prismaService.$transaction(async tx => {
			await this.simplifyDebtsInTransaction(tx, groupId, systemExpenseId)
		})
	}

	/**
	 * Внутрішній метод для спрощення боргів всередині транзакції
	 */
	private async simplifyDebtsInTransaction(
		tx: Prisma.TransactionClient,
		groupId: string,
		systemExpenseId: string
	): Promise<void> {
		// 1. Отримати ВСІ борги зі звичайних витрат з remaining > 0
		const activeDebts = await tx.debt.findMany({
			where: {
				expense: {
					groupId,
					id: { not: systemExpenseId }
				},
				remaining: {
					gt: 0
				}
			},
			select: {
				id: true,
				debtorId: true,
				creditorId: true,
				remaining: true
			}
		})

		// 2. Обчислити баланси з УСІХ боргів зі звичайних витрат (БЕЗ врахування платежів)
		const balances = new Map<string, number>()

		for (const debt of activeDebts) {
			if (debt.remaining > 0) {
				balances.set(
					debt.creditorId,
					(balances.get(debt.creditorId) || 0) + debt.remaining
				)
				balances.set(
					debt.debtorId,
					(balances.get(debt.debtorId) || 0) - debt.remaining
				)
			}
		}

		// 3. Застосувати алгоритм спрощення (БЕЗ врахування платежів)
		const simplifiedDebts = this.calculateSimplifiedDebts(balances)

		// 4. Деактивувати всі борги зі звичайних витрат
		await tx.debt.updateMany({
			where: {
				expense: {
					groupId,
					id: { not: systemExpenseId }
				}
			},
			data: { isActual: false }
		})

		// 5. Видалити всі старі спрощені борги
		await tx.debt.deleteMany({
			where: {
				expenseId: systemExpenseId
			}
		})

		// 6. Створити нові спрощені борги
		for (const newDebt of simplifiedDebts) {
			await tx.debt.create({
				data: {
					expenseId: systemExpenseId,
					debtorId: newDebt.debtorId,
					creditorId: newDebt.creditorId,
					amount: newDebt.amount,
					remaining: newDebt.amount,
					status: 'PENDING',
					isActual: true
				}
			})
		}
	}

	/**
	 * Алгоритм спрощення боргів - жадібний підхід
	 * Мінімізує кількість транзакцій між учасниками
	 */
	private calculateSimplifiedDebts(
		balances: Map<string, number>
	): Array<{ debtorId: string; creditorId: string; amount: number }> {
		const debtors: Array<{ userId: string; amount: number }> = []
		const creditors: Array<{ userId: string; amount: number }> = []

		// Розділити на боржників і кредиторів
		for (const [userId, balance] of balances.entries()) {
			if (balance < -0.01) {
				// Боржники (негативний баланс)
				debtors.push({ userId, amount: -balance })
			} else if (balance > 0.01) {
				// Кредитори (позитивний баланс)
				creditors.push({ userId, amount: balance })
			}
		}

		// Сортувати за спаданням для оптимізації
		debtors.sort((a, b) => b.amount - a.amount)
		creditors.sort((a, b) => b.amount - a.amount)

		// Жадібний алгоритм мінімізації
		const result: Array<{
			debtorId: string
			creditorId: string
			amount: number
		}> = []

		let i = 0,
			j = 0

		while (i < debtors.length && j < creditors.length) {
			const debtor = debtors[i]
			const creditor = creditors[j]

			const amount = Math.min(debtor.amount, creditor.amount)

			result.push({
				debtorId: debtor.userId,
				creditorId: creditor.userId,
				amount: Math.round(amount * 100) / 100 // округлення до 2 знаків
			})

			debtor.amount -= amount
			creditor.amount -= amount

			if (debtor.amount < 0.01) i++
			if (creditor.amount < 0.01) j++
		}

		return result
	}
}
