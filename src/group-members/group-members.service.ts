import { FriendsService } from '@/friends/friends.service'
import { GroupsService } from '@/groups/groups.service'
import { MailService } from '@/libs/mail/mail.service'
import { PrismaService } from '@/prisma/prisma.service'
import { UserService } from '@/user/user.service'
import { BadRequestException, Injectable } from '@nestjs/common'
import { GroupEntity, GroupMemberStatus, GroupRole } from '@prisma/client'

type PartialGroup = Pick<GroupEntity, 'id' | 'name' | 'avatarUrl' | 'eventDate'>

@Injectable()
export class GroupMembersService {
	public constructor(
		public readonly prismaService: PrismaService,
		private readonly userService: UserService,
		private readonly mailService: MailService,
		private readonly groupService: GroupsService,
		private readonly friendsService: FriendsService
	) {}

	public async getUserGroups(userId: string): Promise<PartialGroup[]> {
		const groupMembers: { group: PartialGroup }[] =
			await this.prismaService.groupMember.findMany({
				where: { userId: userId, status: GroupMemberStatus.ACCEPTED },
				include: {
					group: {
						select: {
							id: true,
							name: true,
							avatarUrl: true,
							eventDate: true
						}
					}
				},
				orderBy: { group: { eventDate: 'desc' } }
			})

		return groupMembers.map(member => member.group)
	}

	public async getUserGroupRequests(userId: string): Promise<PartialGroup[]> {
		const groupMembers: { group: PartialGroup }[] =
			await this.prismaService.groupMember.findMany({
				where: { userId: userId, status: GroupMemberStatus.PENDING },
				include: {
					group: {
						select: {
							id: true,
							name: true,
							avatarUrl: true,
							eventDate: true
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
				recieverUserId,
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
}
