import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { CreateNotificationDto } from './dto/create-notification.dto'
import { UpdateNotificationDto } from './dto/update-notification.dto'
import { NotificationResponseDto } from './dto/notification-response.dto'
import { NotificationType, Prisma } from '@prisma/client'

@Injectable()
export class NotificationsService {
	constructor(private readonly prisma: PrismaService) {}

	async create(
		createNotificationDto: CreateNotificationDto
	): Promise<NotificationResponseDto> {
		const notification = await this.prisma.notification.create({
			data: createNotificationDto
		})

		return this.mapToResponseDto(notification)
	}

	async findAllByUserId(userId: string): Promise<NotificationResponseDto[]> {
		const notifications = await this.prisma.notification.findMany({
			where: { userId },
			orderBy: { createdAt: 'desc' },
			take: 50
		})

		return notifications.map(notification =>
			this.mapToResponseDto(notification)
		)
	}

	async findUnreadByUserId(
		userId: string
	): Promise<NotificationResponseDto[]> {
		const notifications = await this.prisma.notification.findMany({
			where: {
				userId,
				isRead: false
			},
			orderBy: { createdAt: 'desc' },
			take: 50
		})

		return notifications.map(notification =>
			this.mapToResponseDto(notification)
		)
	}

	async findOne(id: string): Promise<NotificationResponseDto> {
		const notification = await this.prisma.notification.findUnique({
			where: { id }
		})

		if (!notification) {
			throw new Error('Notification not found')
		}

		return this.mapToResponseDto(notification)
	}

	async markAsRead(id: string): Promise<NotificationResponseDto> {
		const notification = await this.prisma.notification.update({
			where: { id },
			data: { isRead: true }
		})

		return this.mapToResponseDto(notification)
	}

	async markAllAsRead(userId: string): Promise<void> {
		await this.prisma.notification.updateMany({
			where: {
				userId,
				isRead: false
			},
			data: { isRead: true }
		})
	}

	async update(
		id: string,
		updateNotificationDto: UpdateNotificationDto
	): Promise<NotificationResponseDto> {
		const notification = await this.prisma.notification.update({
			where: { id },
			data: updateNotificationDto
		})

		return this.mapToResponseDto(notification)
	}

	async remove(id: string): Promise<void> {
		await this.prisma.notification.delete({
			where: { id }
		})
	}

	// Методи для створення специфічних нотифікацій
	async createFriendRequestNotification(
		receiverId: string,
		senderId: string,
		senderName: string
	): Promise<NotificationResponseDto> {
		return this.create({
			userId: receiverId,
			type: NotificationType.FRIEND_REQUEST,
			title: 'New friend request',
			message: `${senderName} sent you a friend request`,
			relatedUserId: senderId,
			metadata: { senderName }
		})
	}

	async createGroupInvitationNotification(
		userId: string,
		groupId: string,
		groupName: string,
		inviterName: string
	): Promise<NotificationResponseDto> {
		return this.create({
			userId,
			type: NotificationType.GROUP_INVITATION,
			title: 'Group invitation',
			message: `${inviterName} invited you to the group "${groupName}"`,
			relatedGroupId: groupId,
			metadata: { groupName, inviterName }
		})
	}

	async createExpenseAddedNotification(
		userId: string,
		expenseId: string,
		expenseDescription: string,
		groupName: string,
		amount: number
	): Promise<NotificationResponseDto> {
		return this.create({
			userId,
			type: NotificationType.EXPENSE_ADDED,
			title: 'New expense',
			message: `New expense "${expenseDescription}" added to the group "${groupName}" for ${amount}`,
			relatedExpenseId: expenseId,
			metadata: { expenseDescription, groupName, amount }
		})
	}

	async createDebtCreatedNotification(
		userId: string,
		debtId: string,
		expenseDescription: string,
		amount: number,
		isDebtor: boolean
	): Promise<NotificationResponseDto> {
		const message = isDebtor
			? `You owe ${amount} for the expense "${expenseDescription}"`
			: `You get back ${amount} for the expense "${expenseDescription}"`

		return this.create({
			userId,
			type: NotificationType.DEBT_CREATED,
			title: isDebtor ? 'New debt' : 'New credit',
			message,
			relatedDebtId: debtId,
			metadata: { expenseDescription, amount, isDebtor }
		})
	}

	async createUserRemovedFromGroupNotification(
		userId: string,
		groupId: string,
		groupName: string,
		removerName: string
	): Promise<NotificationResponseDto> {
		return this.create({
			userId,
			type: NotificationType.USER_REMOVED_FROM_GROUP,
			title: 'Removed from group',
			message: `${removerName} removed you from the group "${groupName}"`,
			relatedGroupId: groupId,
			metadata: { groupName, removerName }
		})
	}

	private mapToResponseDto(
		notification: Prisma.NotificationGetPayload<Record<string, never>>
	): NotificationResponseDto {
		return {
			id: notification.id,
			userId: notification.userId,
			type: notification.type,
			title: notification.title,
			message: notification.message,
			isRead: notification.isRead,
			createdAt: notification.createdAt,
			relatedUserId: notification.relatedUserId || undefined,
			relatedGroupId: notification.relatedGroupId || undefined,
			relatedExpenseId: notification.relatedExpenseId || undefined,
			relatedDebtId: notification.relatedDebtId || undefined,
			metadata: notification.metadata as Record<string, any> | undefined
		}
	}
}
