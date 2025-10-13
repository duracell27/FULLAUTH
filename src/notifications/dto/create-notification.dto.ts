import {
	IsEnum,
	IsNotEmpty,
	IsOptional,
	IsString,
	IsUUID
} from 'class-validator'
import { NotificationType } from '@prisma/client'

export class CreateNotificationDto {
	@IsNotEmpty({ message: 'notifications.validation.user_id.required' })
	@IsUUID(undefined, { message: 'notifications.validation.user_id.uuid' })
	userId: string

	@IsNotEmpty({ message: 'notifications.validation.type.required' })
	@IsEnum(NotificationType, { message: 'notifications.validation.type.enum' })
	type: NotificationType

	@IsNotEmpty({ message: 'notifications.validation.title.required' })
	@IsString({ message: 'notifications.validation.title.string' })
	title: string

	@IsNotEmpty({ message: 'notifications.validation.message.required' })
	@IsString({ message: 'notifications.validation.message.string' })
	message: string

	@IsOptional()
	@IsUUID(undefined, {
		message: 'notifications.validation.related_user_id.uuid'
	})
	relatedUserId?: string

	@IsOptional()
	@IsUUID(undefined, {
		message: 'notifications.validation.related_group_id.uuid'
	})
	relatedGroupId?: string

	@IsOptional()
	@IsUUID(undefined, {
		message: 'notifications.validation.related_expense_id.uuid'
	})
	relatedExpenseId?: string

	@IsOptional()
	@IsUUID(undefined, {
		message: 'notifications.validation.related_debt_id.uuid'
	})
	relatedDebtId?: string

	@IsOptional()
	metadata?: Record<string, any>
}
