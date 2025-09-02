import { NotificationType } from '@prisma/client'

export class NotificationResponseDto {
	id: string
	userId: string
	type: NotificationType
	title: string
	message: string
	isRead: boolean
	createdAt: Date

	// Деталі для різних типів нотифікацій
	relatedUserId?: string
	relatedGroupId?: string
	relatedExpenseId?: string
	relatedDebtId?: string

	// Додаткові дані
	metadata?: Record<string, any>
}
