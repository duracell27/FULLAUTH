import { FriendsService } from '@/friends/friends.service'
import { GroupsService } from '@/groups/groups.service'
import { MailService } from '@/libs/mail/mail.service'
import { PrismaService } from '@/prisma/prisma.service'
import { UserService } from '@/user/user.service'
import { BadRequestException, Injectable } from '@nestjs/common'
import { GroupEntity, GroupMemberStatus, GroupRole, User } from '@prisma/client'
import { NotificationsService } from '@/notifications/notifications.service'
import { I18nService, I18nContext } from 'nestjs-i18n'

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
		private readonly friendsService: FriendsService,
		private readonly notificationsService: NotificationsService,
		private readonly i18n: I18nService
	) {}

	private t(key: string, options?: any) {
		return this.i18n.translate(`common.${key}`, {
			lang: I18nContext.current()?.lang,
			...options
		})
	}

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
						_sum: { remaining: true }
					}
				)
				const totalOwedByUser = await this.prismaService.debt.aggregate(
					{
						where: {
							debtorId: userId,
							isActual: true,
							expense: { groupId: groupId }
						},
						_sum: { remaining: true }
					}
				)

				// Враховуємо GroupPayment
				const paymentsFrom =
					await this.prismaService.groupPayment.aggregate({
						where: {
							groupId: groupId,
							fromId: userId
						},
						_sum: { amount: true }
					})
				const paymentsTo =
					await this.prismaService.groupPayment.aggregate({
						where: {
							groupId: groupId,
							toId: userId
						},
						_sum: { amount: true }
					})

				const userBalance =
					(totalOwedToUser._sum.remaining || 0) -
					(totalOwedByUser._sum.remaining || 0) +
					(paymentsFrom._sum.amount || 0) -
					(paymentsTo._sum.amount || 0)
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
						_sum: { remaining: true }
					}
				)
				const totalOwedByUser = await this.prismaService.debt.aggregate(
					{
						where: {
							debtorId: userId,
							isActual: true,
							expense: { groupId: groupId }
						},
						_sum: { remaining: true }
					}
				)

				// Враховуємо GroupPayment
				const paymentsFrom =
					await this.prismaService.groupPayment.aggregate({
						where: {
							groupId: groupId,
							fromId: userId
						},
						_sum: { amount: true }
					})
				const paymentsTo =
					await this.prismaService.groupPayment.aggregate({
						where: {
							groupId: groupId,
							toId: userId
						},
						_sum: { amount: true }
					})

				const userBalance =
					(totalOwedToUser._sum.remaining || 0) -
					(totalOwedByUser._sum.remaining || 0) +
					(paymentsFrom._sum.amount || 0) -
					(paymentsTo._sum.amount || 0)
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

		// Отримуємо назву групи та інформацію про користувача
		const groupName = await this.groupService.getGroupName(groupId)
		const user = await this.userService.findById(userId)

		// Знаходимо адміністраторів групи для сповіщення
		const groupAdmins = await this.prismaService.groupMember.findMany({
			where: {
				groupId,
				role: GroupRole.ADMIN,
				status: GroupMemberStatus.ACCEPTED
			},
			select: { userId: true }
		})

		// Створюємо нотифікації для адміністраторів групи
		if (user && groupName) {
			for (const admin of groupAdmins) {
				if (admin.userId !== userId) {
					// Не сповіщаємо самого користувача
					await this.notificationsService.create({
						userId: admin.userId,
						type: 'GROUP_INVITATION',
						title: this.i18n.t(
							'group_members.notifications.invitation_accepted.title'
						),
						message: this.i18n.t(
							'group_members.notifications.invitation_accepted.message',
							{
								args: { userName: user.displayName, groupName }
							}
						),
						relatedGroupId: groupId,
						relatedUserId: userId,
						metadata: { groupName, userName: user.displayName }
					})
				}
			}
		}
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

		// Отримуємо назву групи та інформацію про користувача
		const groupName = await this.groupService.getGroupName(groupId)
		const user = await this.userService.findById(userId)

		// Знаходимо адміністраторів групи для сповіщення
		const groupAdmins = await this.prismaService.groupMember.findMany({
			where: {
				groupId,
				role: GroupRole.ADMIN,
				status: GroupMemberStatus.ACCEPTED
			},
			select: { userId: true }
		})

		// Створюємо нотифікації для адміністраторів групи
		if (user && groupName) {
			for (const admin of groupAdmins) {
				if (admin.userId !== userId) {
					// Не сповіщаємо самого користувача
					await this.notificationsService.create({
						userId: admin.userId,
						type: 'GROUP_INVITATION',
						title: this.i18n.t(
							'group_members.notifications.invitation_rejected.title'
						),
						message: this.i18n.t(
							'group_members.notifications.invitation_rejected.message',
							{
								args: { userName: user.displayName, groupName }
							}
						),
						relatedGroupId: groupId,
						relatedUserId: userId,
						metadata: { groupName, userName: user.displayName }
					})
				}
			}
		}
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
				this.t('group_members.errors.cannot_add_to_personal')
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
				this.t('group_members.errors.user_already_in_group')
			)
		}

		if (isRequestExist?.status === GroupMemberStatus.REJECTED) {
			throw new BadRequestException(
				this.t('group_members.errors.user_rejected_request')
			)
		}

		const isGroupExsist = await this.groupService.isGroupExsist(groupId)

		if (!isGroupExsist) {
			throw new BadRequestException(
				this.t('group_members.errors.group_not_found')
			)
		}
		const groupName = await this.groupService.getGroupName(groupId)

		const user = await this.userService.findById(recieverUserId)
		const isUserExist = !!user

		if (!isUserExist) {
			throw new BadRequestException(
				this.t('group_members.errors.user_not_found')
			)
		}

		const isGroupAdmin = await this.isUserAdminOfGroup(
			senderUserId,
			groupId
		)

		if (!isGroupAdmin) {
			throw new BadRequestException(
				this.t('group_members.errors.not_group_admin')
			)
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

		// Отримуємо ім'я користувача, який додає
		const senderUser = await this.userService.findById(senderUserId)

		// Створюємо нотифікацію для користувача, якого додають
		if (senderUser) {
			await this.notificationsService.createGroupInvitationNotification(
				recieverUserId,
				groupId,
				groupName,
				senderUser.displayName
			)
		}

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
				this.t('group_members.errors.cannot_remove_from_personal')
			)
		}

		const isRequestExist = await this.prismaService.groupMember.findFirst({
			where: {
				userId: recieverUserId,
				groupId: groupId
			}
		})

		if (!isRequestExist) {
			throw new BadRequestException(
				this.t('group_members.errors.user_not_in_group')
			)
		}

		const isGroupExsist = await this.groupService.isGroupExsist(groupId)

		if (!isGroupExsist) {
			throw new BadRequestException(
				this.t('group_members.errors.group_not_found')
			)
		}

		const groupName = await this.groupService.getGroupName(groupId)

		const isUserExist = await this.userService.isUserExist(recieverUserId)

		if (!isUserExist) {
			throw new BadRequestException(
				this.t('group_members.errors.user_not_found')
			)
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
				this.t('group_members.errors.user_involved_in_expenses')
			)
		}

		const isGroupAdmin = await this.isUserAdminOfGroup(
			senderUserId,
			groupId
		)

		if (!isGroupAdmin) {
			throw new BadRequestException(
				this.t('group_members.errors.not_group_admin')
			)
		}

		// Отримуємо ім'я користувача, який видаляє
		const removerUser = await this.userService.findById(senderUserId)

		// Створюємо нотифікацію для користувача, якого видаляють
		if (removerUser) {
			await this.notificationsService.createUserRemovedFromGroupNotification(
				recieverUserId,
				groupId,
				groupName,
				removerUser.displayName
			)
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
