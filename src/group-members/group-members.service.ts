import { FriendsService } from '@/friends/friends.service'
import { GroupsService } from '@/groups/groups.service'
import { MailService } from '@/libs/mail/mail.service'
import { PrismaService } from '@/prisma/prisma.service'
import { UserService } from '@/user/user.service'
import { BadRequestException, Injectable } from '@nestjs/common'
import { GroupEntity, GroupMemberStatus, GroupRole, User } from '@prisma/client'

type PartialGroup = Pick<
	GroupEntity,
	'id' | 'name' | 'avatarUrl' | 'eventDate' | 'isFinished' | 'isPersonal'
>

type UserSafe = Pick<User, 'id' | 'displayName' | 'picture'>

type PartialGroupExtended = PartialGroup & {
	membersCount: number
	members: UserSafe[]
	userBalance: number
}

@Injectable()
export class GroupMembersService {
	public constructor(
		public readonly prismaService: PrismaService,
		private readonly userService: UserService,
		private readonly mailService: MailService,
		private readonly groupService: GroupsService,
		private readonly friendsService: FriendsService
	) {}

	public async getUserGroups(
		userId: string,
		type: 'active' | 'finished',
		limit: number = 10,
		offset: number = 0
	): Promise<PartialGroupExtended[]> {
		const isFinished = type === 'finished'

		const groupMembers = await this.prismaService.groupMember.findMany({
			where: {
				userId: userId,
				status: GroupMemberStatus.ACCEPTED,
				group: {
					isFinished: isFinished,
					isPersonal: false // Тільки звичайні групи
				}
			},
			include: {
				group: {
					select: {
						id: true,
						name: true,
						avatarUrl: true,
						eventDate: true,
						isFinished: true,
						isPersonal: true,
						members: {
							where: { status: GroupMemberStatus.ACCEPTED },
							select: {
								userId: true,
								user: {
									select: {
										id: true,
										displayName: true,
										picture: true
									}
								}
							}
						}
					}
				}
			},
			orderBy: { group: { eventDate: 'desc' } },
			skip: offset,
			take: limit
		})

		// console.log(groupMembers)

		const groupsWithBalance = await Promise.all(
			groupMembers.map(async member => {
				const groupId = member.group.id
				const totalOwedToUser = await this.prismaService.debt.aggregate(
					{
						where: {
							creditorId: userId,
							isActual: true,
							expense: { groupId: groupId }
						},
						_sum: { amount: true }
					}
				)
				const totalOwedByUser = await this.prismaService.debt.aggregate(
					{
						where: {
							debtorId: userId,
							isActual: true,
							expense: { groupId: groupId }
						},
						_sum: { amount: true }
					}
				)
				const userBalance =
					(totalOwedToUser._sum.amount || 0) -
					(totalOwedByUser._sum.amount || 0)
				const members: UserSafe[] = member.group.members.map(m => ({
					id: m.user.id,
					displayName: m.user.displayName,
					picture: m.user.picture
				}))
				return {
					id: member.group.id,
					name: member.group.name,
					avatarUrl: member.group.avatarUrl,
					eventDate: member.group.eventDate,
					isFinished: member.group.isFinished,
					isPersonal: member.group.isPersonal,
					membersCount: member.group.members.length,
					members,
					userBalance
				}
			})
		)

		return groupsWithBalance
	}

	public async getUserPersonalGroups(
		userId: string,
		type: 'active' | 'finished',
		limit: number = 10,
		offset: number = 0
	): Promise<PartialGroupExtended[]> {
		const isFinished = type === 'finished'

		const groupMembers = await this.prismaService.groupMember.findMany({
			where: {
				userId: userId,
				status: GroupMemberStatus.ACCEPTED,
				group: {
					isFinished: isFinished,
					isPersonal: true // Тільки персональні групи
				}
			},
			include: {
				group: {
					select: {
						id: true,
						name: true,
						avatarUrl: true,
						eventDate: true,
						isFinished: true,
						isPersonal: true,
						members: {
							where: { status: GroupMemberStatus.ACCEPTED },
							select: {
								userId: true,
								user: {
									select: {
										id: true,
										displayName: true,
										picture: true
									}
								}
							}
						}
					}
				}
			},
			orderBy: { group: { eventDate: 'desc' } },
			skip: offset,
			take: limit
		})

		const groupsWithBalance = await Promise.all(
			groupMembers.map(async member => {
				const groupId = member.group.id
				const totalOwedToUser = await this.prismaService.debt.aggregate(
					{
						where: {
							creditorId: userId,
							isActual: true,
							expense: { groupId: groupId }
						},
						_sum: { amount: true }
					}
				)
				const totalOwedByUser = await this.prismaService.debt.aggregate(
					{
						where: {
							debtorId: userId,
							isActual: true,
							expense: { groupId: groupId }
						},
						_sum: { amount: true }
					}
				)
				const userBalance =
					(totalOwedToUser._sum.amount || 0) -
					(totalOwedByUser._sum.amount || 0)
				const members: UserSafe[] = member.group.members.map(m => ({
					id: m.user.id,
					displayName: m.user.displayName,
					picture: m.user.picture
				}))
				return {
					id: member.group.id,
					name: member.group.name,
					avatarUrl: member.group.avatarUrl,
					eventDate: member.group.eventDate,
					isFinished: member.group.isFinished,
					isPersonal: member.group.isPersonal,
					membersCount: member.group.members.length,
					members,
					userBalance
				}
			})
		)

		return groupsWithBalance
	}

	public async getUserGroupRequests(userId: string): Promise<PartialGroup[]> {
		const groupMembers: { group: PartialGroup }[] =
			await this.prismaService.groupMember.findMany({
				where: {
					userId: userId,
					status: GroupMemberStatus.PENDING,
					group: {
						isPersonal: false // Тільки звичайні групи
					}
				},
				include: {
					group: {
						select: {
							id: true,
							name: true,
							avatarUrl: true,
							eventDate: true,
							isFinished: true,
							isPersonal: true
						}
					}
				}
			})

		return groupMembers.map(member => member.group)
	}

	public async acceptAddGroupRequest(groupId: string, userId: string) {
		await this.prismaService.groupMember.update({
			where: {
				userId_groupId: {
					userId: userId,
					groupId: groupId
				},
				status: GroupMemberStatus.PENDING
			},
			data: {
				status: GroupMemberStatus.ACCEPTED
			}
		})
	}

	public async rejectAddGroupRequest(groupId: string, userId: string) {
		await this.prismaService.groupMember.update({
			where: {
				userId_groupId: {
					userId: userId,
					groupId: groupId
				},
				status: GroupMemberStatus.PENDING
			},
			data: {
				status: GroupMemberStatus.REJECTED
			}
		})
	}

	public async addUserToGroup(
		groupId: string,
		recieverUserId: string,
		senderUserId: string
	) {
		// Перевіряємо, чи це персональна група
		const group = await this.prismaService.groupEntity.findUnique({
			where: { id: groupId },
			select: { isPersonal: true }
		})

		if (group?.isPersonal) {
			throw new BadRequestException(
				'Cannot add users to personal groups through this endpoint. Personal groups are created automatically with exactly 2 members.'
			)
		}

		const isRequestExist = await this.prismaService.groupMember.findFirst({
			where: {
				userId: recieverUserId,
				groupId: groupId
			}
		})

		if (
			isRequestExist?.status === GroupMemberStatus.PENDING ||
			isRequestExist?.status === GroupMemberStatus.ACCEPTED
		) {
			throw new BadRequestException(
				'User is already in the group or has not yet confirmed membership'
			)
		}

		if (isRequestExist?.status === GroupMemberStatus.REJECTED) {
			throw new BadRequestException('User has rejected the request')
		}

		const isGroupExsist = await this.groupService.isGroupExsist(groupId)

		if (!isGroupExsist) {
			throw new BadRequestException('Group not found')
		}
		const groupName = await this.groupService.getGroupName(groupId)

		const user = await this.userService.findById(recieverUserId)
		const isUserExist = !!user

		if (!isUserExist) {
			throw new BadRequestException('User not found')
		}

		const isGroupAdmin = await this.isUserAdminOfGroup(
			senderUserId,
			groupId
		)

		if (!isGroupAdmin) {
			throw new BadRequestException('You are not admin of this group')
		}

		const isUserFriends = await this.friendsService.isUsersFriends(
			senderUserId,
			recieverUserId
		)

		const groupMemberObj = await this.prismaService.groupMember.create({
			data: {
				userId: recieverUserId,
				groupId: groupId,
				role: GroupRole.MEMBER,
				status: isUserFriends
					? GroupMemberStatus.ACCEPTED
					: GroupMemberStatus.PENDING
			}
		})

		if (isUserFriends) {
			await this.mailService.sendGroupInvitationEmail(
				user.email,
				groupName,
				user.displayName
			)
		} else {
			await this.mailService.sendGroupInvitationWithConfirmEmail(
				user.email,
				groupName,
				user.displayName
			)
		}

		return groupMemberObj
	}

	public async deleteUserFromGroup(
		groupId: string,
		recieverUserId: string,
		senderUserId: string
	) {
		// Перевіряємо, чи це персональна група
		const group = await this.prismaService.groupEntity.findUnique({
			where: { id: groupId },
			select: { isPersonal: true }
		})

		if (group?.isPersonal) {
			throw new BadRequestException(
				'Cannot remove users from personal groups. Personal groups are designed to have exactly 2 members.'
			)
		}

		const isRequestExist = await this.prismaService.groupMember.findFirst({
			where: {
				userId: recieverUserId,
				groupId: groupId
			}
		})

		if (!isRequestExist) {
			throw new BadRequestException('User is not in the group')
		}

		const isGroupExsist = await this.groupService.isGroupExsist(groupId)

		if (!isGroupExsist) {
			throw new BadRequestException('Group not found')
		}

		const isUserExist = await this.userService.isUserExist(recieverUserId)

		if (!isUserExist) {
			throw new BadRequestException('User not found')
		}

		// Перевірка, чи користувач задіяний у розрахунках групи
		const isPayer = await this.prismaService.expensePayment.findFirst({
			where: {
				payerId: recieverUserId,
				expense: { groupId }
			}
		})

		const isDebtorOrCreditor = await this.prismaService.debt.findFirst({
			where: {
				expense: { groupId },
				OR: [
					{ debtorId: recieverUserId },
					{ creditorId: recieverUserId }
				]
			}
		})

		if (isPayer || isDebtorOrCreditor) {
			throw new BadRequestException(
				'User is involved in group expenses or debts and cannot be removed.'
			)
		}

		const isGroupAdmin = await this.isUserAdminOfGroup(
			senderUserId,
			groupId
		)

		if (!isGroupAdmin) {
			throw new BadRequestException('You are not admin of this group')
		}

		await this.prismaService.groupMember.delete({
			where: {
				userId_groupId: {
					userId: recieverUserId,
					groupId: groupId
				}
			}
		})

		return true
	}

	public async isUserAdminOfGroup(userId: string, groupId: string) {
		const userGroupAdmin = await this.prismaService.groupMember.findFirst({
			where: {
				userId: userId,
				groupId: groupId,
				role: 'ADMIN'
			}
		})

		return !!userGroupAdmin
	}

	public async isUserGroupMember(userId: string, groupId: string) {
		const isMember = await this.prismaService.groupMember.findFirst({
			where: { userId: userId, groupId: groupId }
		})

		return !!isMember
	}
}
