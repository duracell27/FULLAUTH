import { BadRequestException, Injectable } from '@nestjs/common'
import { CreateGroupDto } from './dto/CreateGroupDto'
import { PrismaService } from '@/prisma/prisma.service'
import { UpdateGroupDto } from './dto/UpdateGroupDto'
import { GroupMemberStatus, GroupRole } from '@prisma/client'

type GroupWithMembers = {
	id: string
	name: string
	avatarUrl: string | null
	isLocked: boolean
	isFinished: boolean
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
}

@Injectable()
export class GroupsService {
	public constructor(private readonly prismaService: PrismaService) {}

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
							where: {
								payerId: userId
							},
							select: {
								amount: true
							}
						},
						splits: {
							// Виправлення: тільки записи де користувач є боржником
							where: {
								OR: [
									{ debtorId: userId },
									{ creditorId: userId }
								]
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

		return {
			...group,
			expenses: expensesWithBalance,
			totalExpenses, // <-- Додано
			userTotalBalance // <-- Додано
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
