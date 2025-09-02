import { BadRequestException, Injectable } from '@nestjs/common'
import { CreateGroupDto } from './dto/CreateGroupDto'
import { CreatePersonalGroupDto } from './dto/CreatePersonalGroupDto'
import { PrismaService } from '@/prisma/prisma.service'
import { UpdateGroupDto } from './dto/UpdateGroupDto'
import { GroupMemberStatus, GroupRole } from '@prisma/client'
import { NotificationsService } from '../notifications/notifications.service'

type GroupWithMembers = {
	id: string
	name: string
	avatarUrl: string | null
	isLocked: boolean
	isFinished: boolean
	isPersonal: boolean
	totalExpenses: number
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
		private readonly notificationsService: NotificationsService
	) {}

	public async createGroup(userId: string, dto: CreateGroupDto) {
		const group = await this.prismaService.groupEntity.create({
			data: {
				name: dto.name,
				avatarUrl: dto.avatarUrl,
				eventDate: dto.eventDate
			}
		})

		await this.prismaService.groupMember.create({
			data: {
				userId: userId,
				groupId: group.id,
				role: GroupRole.ADMIN,
				status: GroupMemberStatus.ACCEPTED
			}
		})

		return group
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
			throw new BadRequestException('User not found')
		}

		// Перевіряємо, чи не є це той самий користувач
		if (userId === dto.userId) {
			throw new BadRequestException(
				'Cannot create personal group with yourself'
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
					'Personal group already exists between these users'
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
			throw new BadRequestException('You are not admin of this group')
		}

		if (dto.isFinished === true) {
			// Перевіряємо, чи є невиплачені борги у групі
			const allDebts = await this.prismaService.debt.findMany({
				where: {
					expense: {
						groupId: dto.groupId
					}
				},
				select: {
					remaining: true
				}
			})

			const hasUnpaidDebts = allDebts.some(debt => debt.remaining > 0)
			if (hasUnpaidDebts) {
				throw new BadRequestException(
					'Групу не можна завершити, поки є невиплачені борги'
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

		if (!userGroupAdmin) {
			throw new BadRequestException('You are not admin of this group')
		}

		// Перевірка: групу можна видалити лише якщо вона завершена і немає невиплачених боргів
		const group = await this.prismaService.groupEntity.findFirst({
			where: { id: groupId },
			select: { isFinished: true }
		})
		if (!group?.isFinished) {
			throw new BadRequestException(
				'You can only delete a group if it is finished. You can finish it in the group settings when editing'
			)
		}

		const allDebts = await this.prismaService.debt.findMany({
			where: {
				expense: {
					groupId: groupId
				}
			},
			select: {
				remaining: true
			}
		})
		const hasUnpaidDebts = allDebts.some(debt => debt.remaining > 0)
		if (hasUnpaidDebts) {
			throw new BadRequestException(
				'Group cannot be deleted while there are unpaid debts'
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
								],
								isActual: true
							},
							select: {
								amount: true,
								debtorId: true,
								creditorId: true
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
			throw new BadRequestException('Group not found')
		}

		// Явна перевірка, чи members є масивом (хоча тип гарантує, що це масив)
		if (!Array.isArray(group.members)) {
			throw new BadRequestException(
				'Group members are not properly defined'
			)
		}

		// Перевірка, чи є користувач у групі
		const isMember = group.members.some(member => member.userId === userId)
		if (!isMember) {
			throw new BadRequestException('User is not in the group')
		}

		// Обчислюємо баланс користувача для кожної витрати
		const expensesWithBalance = group.expenses.map(expense => {
			const totalOwedToUser = expense.splits
				.filter(split => split.creditorId === userId)
				.reduce((sum, split) => sum + split.amount, 0)

			// Гроші, що поточний юзер винен іншим за цю витрату
			const totalOwedByUser = expense.splits
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

		// 2. Загальний баланс користувача по всій групі
		// Ми використовуємо новий масив `expensesWithBalance`,
		// оскільки там вже розрахований баланс по кожній витраті.
		const userTotalBalance = expensesWithBalance.reduce(
			(sum, expense) => sum + expense.userBalance,
			0
		)

		// --- НОВИЙ КОД: Обчислення балансів всіх учасників ---

		// Отримуємо всі борги в групі для розрахунку балансів учасників
		const allDebts = await this.prismaService.debt.findMany({
			where: {
				expense: {
					groupId: groupId
				}
			},
			select: {
				debtorId: true,
				creditorId: true,
				remaining: true,
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
				},
				payments: {
					select: {
						amount: true,
						createdAt: true,
						isActual: true,
						creatorId: true,
						creator: {
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

		type PaymentBetweenMembers = {
			from: { id: string; displayName: string; picture: string | null }
			to: { id: string; displayName: string; picture: string | null }
			amount: number
			creators: Array<{
				id: string
				displayName: string
				picture: string | null
			}>
		}
		const paymentsMap = new Map<string, PaymentBetweenMembers>()
		const overpaysMap = new Map<string, PaymentBetweenMembers>()

		for (const debt of allDebts) {
			// ВСІ платежі (isActual true + false)
			const totalPaid = debt.payments.reduce(
				(sum, p) => sum + (p.amount || 0),
				0
			)
			if (totalPaid > 0) {
				const key = debt.debtorId + '->' + debt.creditorId
				if (paymentsMap.has(key)) {
					const existingPayment = paymentsMap.get(key)!
					existingPayment.amount += totalPaid
					// Додаємо унікальних креаторів
					for (const payment of debt.payments) {
						if (payment.creator) {
							const creatorExists = existingPayment.creators.some(
								creator => creator.id === payment.creator.id
							)
							if (!creatorExists) {
								existingPayment.creators.push(payment.creator)
							}
						}
					}
				} else {
					// Збираємо унікальних креаторів
					const uniqueCreators: Array<{
						id: string
						displayName: string
						picture: string | null
					}> = []
					for (const payment of debt.payments) {
						if (payment.creator) {
							const creatorExists = uniqueCreators.some(
								creator => creator.id === payment.creator.id
							)
							if (!creatorExists) {
								uniqueCreators.push(payment.creator)
							}
						}
					}

					paymentsMap.set(key, {
						from: debt.debtor,
						to: debt.creditor,
						amount: totalPaid,
						creators: uniqueCreators
					})
				}
			}

			// Overpays (isActual: false)
			const overpaidPayments = debt.payments.filter(p => !p.isActual)
			const overpaid = overpaidPayments.reduce(
				(sum, p) => sum + (p.amount || 0),
				0
			)
			if (overpaid > 0) {
				const key = debt.debtorId + '->' + debt.creditorId
				if (overpaysMap.has(key)) {
					const existingOverpay = overpaysMap.get(key)!
					existingOverpay.amount += overpaid
					// Додаємо унікальних креаторів
					for (const payment of overpaidPayments) {
						if (payment.creator) {
							const creatorExists = existingOverpay.creators.some(
								creator => creator.id === payment.creator.id
							)
							if (!creatorExists) {
								existingOverpay.creators.push(payment.creator)
							}
						}
					}
				} else {
					// Збираємо унікальних креаторів
					const uniqueCreators: Array<{
						id: string
						displayName: string
						picture: string | null
					}> = []
					for (const payment of overpaidPayments) {
						if (payment.creator) {
							const creatorExists = uniqueCreators.some(
								creator => creator.id === payment.creator.id
							)
							if (!creatorExists) {
								uniqueCreators.push(payment.creator)
							}
						}
					}

					overpaysMap.set(key, {
						from: debt.debtor,
						to: debt.creditor,
						amount: overpaid,
						creators: uniqueCreators
					})
				}
			}
		}
		const paymentsBetweenMembers = Array.from(paymentsMap.values())
		const overpays = Array.from(overpaysMap.values())

		// Створюємо Map для швидкого доступу до балансів учасників
		const memberBalances = new Map<string, number>()

		// Ініціалізуємо баланси всіх учасників нулем
		group.members.forEach(member => {
			memberBalances.set(member.userId, 0)
		})

		// Обчислюємо баланс кожного учасника
		allDebts.forEach(debt => {
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

			// Додаємо тільки тих учасників, у яких баланс не дорівнює 0
			if (memberBalance !== 0) {
				// Знаходимо всі борги пов'язані з цим учасником
				const memberDebts = allDebts.filter(
					debt =>
						debt.creditorId === member.userId ||
						debt.debtorId === member.userId
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
								user: debt.debtor,
								amount: debt.remaining,
								type: 'owes_to_member'
							})
						}
					} else if (debt.debtorId === member.userId) {
						// Цей учасник винен
						const existingDebt = debtDetails.get(debt.creditorId)
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
								user: debt.creditor,
								amount: debt.remaining,
								type: 'member_owes_to'
							})
						}
					}
				})

				// Конвертуємо Map в масив і фільтруємо нульові борги
				const debtDetailsArray = Array.from(
					debtDetails.values()
				).filter(detail => detail.amount > 0)

				if (debtDetailsArray.length > 0) {
					memberBalanceDetails.push({
						user: member.user,
						role: member.role,
						totalBalance: memberBalance,
						debtDetails: debtDetailsArray
					})
				}
			}
		}

		return {
			...group,
			expenses: expensesWithBalance,
			totalExpenses,
			userTotalBalance,
			memberBalanceDetails, // <-- Додано нове поле для акордеону
			paymentsBetweenMembers,
			overpays
			// платежі
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
}
