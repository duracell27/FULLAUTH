import { PrismaService } from '@/prisma/prisma.service'
import { BadRequestException, Injectable } from '@nestjs/common'
import { FriendStatus } from '@prisma/client'

@Injectable()
export class FriendsService {
	public constructor(private readonly prismaService: PrismaService) {}
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
				'You can not send a friend request to yourself'
			)
		}
		const isFrendRequestExists =
			await this.prismaService.friendRequests.findFirst({
				where: {
					OR: [
						{
							senderId: receiverId,
							status: FriendStatus.PENDING
						},
						{
							receiverId: receiverId,
							status: FriendStatus.PENDING
						}
					]
				}
			})

		if (isFrendRequestExists) {
			throw new BadRequestException('Friend request already exists')
		}

		await this.prismaService.friendRequests.create({
			data: {
				senderId,
				receiverId,
				status: 'PENDING'
			}
		})
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
			throw new BadRequestException('Friend request not found')
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
			throw new BadRequestException('Friend request not found')
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
							status: FriendStatus.ACCEPTED
						},
						{
							receiverId: senderId,
							status: FriendStatus.ACCEPTED
						}
					]
				}
			})

		if (!isFriendRequestExists) {
			throw new BadRequestException('Friend request not found')
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
