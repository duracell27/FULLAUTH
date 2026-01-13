import {
	IsBoolean,
	IsEmail,
	IsNotEmpty,
	IsOptional,
	IsString
} from 'class-validator'

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
}
