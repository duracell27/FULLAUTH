import { Injectable } from '@nestjs/common'
import { I18nService, I18nContext } from 'nestjs-i18n'
import { PrismaService } from '../prisma/prisma.service'
import { CreateNotificationDto } from './dto/create-notification.dto'
import { UpdateNotificationDto } from './dto/update-notification.dto'
import { NotificationResponseDto } from './dto/notification-response.dto'
import { NotificationType, Prisma } from '@prisma/client'

@Injectable()
export class NotificationsService {
	constructor(
		private readonly prisma: PrismaService,
		private readonly i18n: I18nService
	) {}

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
			throw new Error(
				this.i18n.t('common.errors.notification_not_found', {
					lang: I18nContext.current()?.lang
				})
			)
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
		const existingNotification = await this.prisma.notification.findUnique({
			where: { id }
		})

		if (!existingNotification) {
			throw new Error(
				this.i18n.t('common.errors.notification_not_found', {
					lang: I18nContext.current()?.lang
				})
			)
		}

		await this.prisma.notification.delete({
			where: { id }
		})
	}

	async removeAll(userId: string): Promise<void> {
		await this.prisma.notification.deleteMany({
			where: { userId }
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
			title: this.i18n.t('common.notifications.friend_request.title', {
				lang: I18nContext.current()?.lang
			}),
			message: this.i18n.t(
				'common.notifications.friend_request.message',
				{
					lang: I18nContext.current()?.lang,
					args: { senderName }
				}
			),
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
			title: this.i18n.t('common.notifications.group_invitation.title', {
				lang: I18nContext.current()?.lang
			}),
			message: this.i18n.t(
				'common.notifications.group_invitation.message',
				{
					lang: I18nContext.current()?.lang,
					args: { inviterName, groupName }
				}
			),
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
			title: this.i18n.t('common.notifications.expense_added.title', {
				lang: I18nContext.current()?.lang
			}),
			message: this.i18n.t('common.notifications.expense_added.message', {
				lang: I18nContext.current()?.lang,
				args: { expenseDescription, groupName, amount }
			}),
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
		const titleKey = isDebtor
			? 'notifications.debt_created.title_debtor'
			: 'notifications.debt_created.title_creditor'
		const messageKey = isDebtor
			? 'notifications.debt_created.message_debtor'
			: 'notifications.debt_created.message_creditor'

		return this.create({
			userId,
			type: NotificationType.DEBT_CREATED,
			title: this.i18n.t(titleKey, {
				lang: I18nContext.current()?.lang
			}),
			message: this.i18n.t(messageKey, {
				lang: I18nContext.current()?.lang,
				args: { amount, expenseDescription }
			}),
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
			title: this.i18n.t(
				'common.notifications.user_removed_from_group.title',
				{ lang: I18nContext.current()?.lang }
			),
			message: this.i18n.t(
				'notifications.user_removed_from_group.message',
				{
					lang: I18nContext.current()?.lang,
					args: { removerName, groupName }
				}
			),
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
