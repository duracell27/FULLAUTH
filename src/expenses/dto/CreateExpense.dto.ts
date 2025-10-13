import {
	IsArray,
	IsEnum,
	IsNotEmpty,
	IsNumber,
	IsOptional,
	IsString,
	IsUUID,
	ValidateNested,
	Min,
	IsDate,
	IsObject
} from 'class-validator'
import { Type } from 'class-transformer'
import { SplitType } from '@prisma/client' // Імпортуємо енум з Prisma

// Описує одного платника
export class PayerDto {
	@IsUUID(undefined, { message: 'validation.user_id.uuid' })
	userId: string

	@IsNumber({}, { message: 'validation.amount.number' })
	@Min(0.01, { message: 'validation.amount.positive' })
	amount: number
}

// Описує одного боржника та параметри його боргу
export class DebtorDto {
	@IsUUID(undefined, { message: 'validation.user_id.uuid' })
	userId: string

	// Поля нижче є опціональними, бо залежать від SplitType
	@IsOptional()
	@IsNumber({}, { message: 'validation.amount.number' })
	amount?: number // Для SplitType.CUSTOM

	@IsOptional()
	@IsNumber({}, { message: 'validation.percentage.number' })
	percentage?: number // для SplitType.PERCENTAGE

	@IsOptional()
	@IsNumber({}, { message: 'validation.shares.number' })
	shares?: number // для SplitType.SHARES

	@IsOptional()
	@IsNumber({}, { message: 'validation.extra_amount.number' })
	extraAmount?: number // для SplitType.EXTRA
}

// Головний DTO для створення витрати
export class CreateExpenseDto {
	@IsString({ message: 'validation.description.string' })
	@IsNotEmpty({ message: 'validation.description.required' })
	description: string

	@IsNumber({}, { message: 'validation.amount.number' })
	@Min(0.01, { message: 'validation.amount.positive' })
	amount: number // Загальна сума витрати

	@IsUUID(undefined, { message: 'validation.group_id.uuid' })
	groupId: string

	@IsEnum(SplitType, { message: 'validation.split_type.enum' })
	splitType: SplitType

	@IsOptional()
	@IsString({ message: 'validation.photo_url.string' })
	photoUrl?: string

	@IsDate({ message: 'validation.date.date' })
	@Type(() => Date)
	@IsOptional()
	date?: Date

	@IsOptional()
	@IsObject({ message: 'validation.form_data.object' })
	formData?: Record<string, any>

	@IsArray({ message: 'validation.payers.array' })
	@ValidateNested({ each: true })
	@Type(() => PayerDto)
	payers: PayerDto[] // Хто платив

	@IsArray({ message: 'validation.debtors.array' })
	@ValidateNested({ each: true })
	@Type(() => DebtorDto)
	debtors: DebtorDto[] // Між ким ділити
}
