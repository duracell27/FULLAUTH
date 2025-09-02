import {
	IsEnum,
	IsNotEmpty,
	IsOptional,
	IsString,
	IsUUID
} from 'class-validator'
import { NotificationType } from '@prisma/client'

export class CreateNotificationDto {
	@IsNotEmpty()
	@IsUUID()
	userId: string

	@IsNotEmpty()
	@IsEnum(NotificationType)
	type: NotificationType

	@IsNotEmpty()
	@IsString()
	title: string

	@IsNotEmpty()
	@IsString()
	message: string

	@IsOptional()
	@IsUUID()
	relatedUserId?: string

	@IsOptional()
	@IsUUID()
	relatedGroupId?: string

	@IsOptional()
	@IsUUID()
	relatedExpenseId?: string

	@IsOptional()
	@IsUUID()
	relatedDebtId?: string

	@IsOptional()
	metadata?: Record<string, any>
}
