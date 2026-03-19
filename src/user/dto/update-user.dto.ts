import {
	IsBoolean,
	IsEmail,
	IsEnum,
	IsNotEmpty,
	IsOptional,
	IsString
} from 'class-validator'
import { CardVisibility } from '@prisma/client'

export class UpdateUserDto {
	@IsString({ message: 'user.validation.name.string' })
	@IsNotEmpty({ message: 'user.validation.name.required' })
	name: string

	@IsString({ message: 'user.validation.email.string' })
	@IsEmail({}, { message: 'user.validation.email.email' })
	@IsNotEmpty({ message: 'user.validation.email.required' })
	email: string

	@IsBoolean({ message: 'user.validation.is_two_factor_enabled.boolean' })
	isTwoFactorEnabled: boolean

	@IsString({ message: 'user.validation.picture.string' })
	@IsOptional()
	picture?: string

	@IsString()
	@IsOptional()
	cardNumber?: string | null

	@IsEnum(CardVisibility)
	@IsOptional()
	cardVisibility?: CardVisibility
}
