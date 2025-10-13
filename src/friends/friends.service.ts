import { PrismaService } from '@/prisma/prisma.service'
import { BadRequestException, Injectable } from '@nestjs/common'
import { FriendStatus } from '@prisma/client'
import { NotificationsService } from '../notifications/notifications.service'
import { I18nService } from 'nestjs-i18n'

@Injectable()
export class FriendsService {
	public constructor(
		private readonly prismaService: PrismaService,
		private readonly notificationsService: NotificationsService,
		private readonly i18n: I18nService
	) {}
	public async getUserFriends(userId: string) {
		const friendsDocs = await this.prismaService.friendRequests.findMany({
			where: {
				OR: [
					{
						senderId: userId
					},
					{
						receiverId: userId
					}
				]
			},
			include: {
				sender: {
					select: {
						displayName: true,
						picture: true
					}
				},
				receiver: {
					select: {
						displayName: true,
						picture: true
					}
				}
			}
		})

		const friends = friendsDocs.filter(
			friend => friend.status === 'ACCEPTED'
		)

		const friendRequests = friendsDocs.filter(
			friend =>
				friend.status === 'PENDING' && friend.receiverId === userId
		)

		const friendRequestsSended = friendsDocs.filter(
			friend => friend.status === 'PENDING' && friend.senderId === userId
		)

		return { friends, friendRequests, friendRequestsSended }
	}

	public async sendFriendRequest(receiverId: string, senderId: string) {
		if (receiverId === senderId) {
			throw new BadRequestException(
				this.i18n.t('friends.errors.cannot_send_to_self')
			)
		}
		const isFrendRequestExists =
			await this.prismaService.friendRequests.findFirst({
				where: {
					OR: [
						{
							receiverId: senderId,
							senderId: receiverId,
							status: FriendStatus.PENDING
						},
						{
							senderId: senderId,
							receiverId: receiverId,
							status: FriendStatus.PENDING
						}
					]
				}
			})

		if (isFrendRequestExists) {
			throw new BadRequestException(
				this.i18n.t('friends.errors.request_already_exists')
			)
		}

		// Check if users are already friends
		const isAlreadyFriends =
			await this.prismaService.friendRequests.findFirst({
				where: {
					OR: [
						{
							senderId: senderId,
							receiverId: receiverId,
							status: FriendStatus.ACCEPTED
						},
						{
							senderId: receiverId,
							receiverId: senderId,
							status: FriendStatus.ACCEPTED
						}
					]
				}
			})

		if (isAlreadyFriends) {
			throw new BadRequestException(
				this.i18n.t('friends.errors.already_friends')
			)
		}

		const friendRequest = await this.prismaService.friendRequests.create({
			data: {
				senderId,
				receiverId,
				status: 'PENDING'
			}
		})

		// Створюємо нотифікацію для отримувача
		const sender = await this.prismaService.user.findUnique({
			where: { id: senderId },
			select: { displayName: true }
		})

		if (sender) {
			await this.notificationsService.createFriendRequestNotification(
				receiverId,
				senderId,
				sender.displayName
			)
		}

		return friendRequest
	}

	public async acceptFriendRequest(
		friendRequestId: string,
		receiverId: string
	) {
		const isFriendRequestExists =
			await this.prismaService.friendRequests.findFirst({
				where: {
					id: friendRequestId,
					receiverId: receiverId
				}
			})

		if (!isFriendRequestExists) {
			throw new BadRequestException(
				this.i18n.t('friends.errors.request_not_found')
			)
		}

		await this.prismaService.friendRequests.update({
			where: {
				id: friendRequestId
			},
			data: {
				status: 'ACCEPTED'
			}
		})
	}

	public async rejectFriendRequest(
		friendRequestId: string,
		receiverId: string
	) {
		const isFriendRequestExists =
			await this.prismaService.friendRequests.findFirst({
				where: {
					id: friendRequestId,
					receiverId: receiverId
				}
			})

		if (!isFriendRequestExists) {
			throw new BadRequestException(
				this.i18n.t('friends.errors.request_not_found')
			)
		}

		await this.prismaService.friendRequests.update({
			where: {
				id: friendRequestId
			},
			data: {
				status: 'REJECTED'
			}
		})
	}

	public async cancelFriendRequest(
		friendRequestId: string,
		senderId: string
	) {
		const isFriendRequestExists =
			await this.prismaService.friendRequests.findFirst({
				where: {
					id: friendRequestId,
					OR: [
						{
							senderId: senderId,
							status: FriendStatus.PENDING
						},
						{
							receiverId: senderId,
							status: FriendStatus.PENDING
						}
					]
				}
			})

		if (!isFriendRequestExists) {
			throw new BadRequestException(
				this.i18n.t('friends.errors.request_not_found')
			)
		}

		await this.prismaService.friendRequests.delete({
			where: {
				id: friendRequestId
			}
		})
	}

	public async isUsersFriends(userId: string, friendId: string) {
		const isFriendsExists =
			await this.prismaService.friendRequests.findFirst({
				where: {
					OR: [
						{
							senderId: userId,
							receiverId: friendId,
							status: FriendStatus.ACCEPTED
						},
						{
							senderId: friendId,
							receiverId: userId,
							status: FriendStatus.ACCEPTED
						}
					]
				}
			})

		return !!isFriendsExists
	}
}
