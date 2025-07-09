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
	@IsUUID()
	userId: string

	@IsNumber()
	@Min(0.01)
	amount: number
}

// Описує одного боржника та параметри його боргу
export class DebtorDto {
	@IsUUID()
	userId: string

	// Поля нижче є опціональними, бо залежать від SplitType
	@IsOptional()
	@IsNumber()
	amount?: number // Для SplitType.CUSTOM

	@IsOptional()
	@IsNumber()
	percentage?: number // для SplitType.PERCENTAGE

	@IsOptional()
	@IsNumber()
	shares?: number // для SplitType.SHARES

	@IsOptional()
	@IsNumber()
	extraAmount?: number // для SplitType.EXTRA
}

// Головний DTO для створення витрати
export class CreateExpenseDto {
	@IsString()
	@IsNotEmpty()
	description: string

	@IsNumber()
	@Min(0.01)
	amount: number // Загальна сума витрати

	@IsUUID()
	groupId: string

	@IsEnum(SplitType)
	splitType: SplitType

	@IsOptional()
	@IsString()
	photoUrl?: string

	@IsDate()
	@Type(() => Date)
	@IsOptional()
	date?: Date

	@IsOptional()
	@IsObject()
	formData?: Record<string, any>

	@IsArray()
	@ValidateNested({ each: true })
	@Type(() => PayerDto)
	payers: PayerDto[] // Хто платив

	@IsArray()
	@ValidateNested({ each: true })
	@Type(() => DebtorDto)
	debtors: DebtorDto[] // Між ким ділити
}
