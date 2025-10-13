import {
	IsEmail,
	IsNotEmpty,
	IsOptional,
	IsString,
	MinLength
} from 'class-validator'

export class LoginDto {
	@IsString({ message: 'validation.email.string' })
	@IsEmail({}, { message: 'validation.email.invalid_format' })
	@IsNotEmpty({ message: 'validation.email.required' })
	email: string

	@IsString({ message: 'validation.password.string' })
	@IsNotEmpty({ message: 'validation.password.required' })
	@MinLength(6, { message: 'validation.password.min_length' })
	password: string

	@IsOptional()
	@IsString({ message: 'validation.code.string' })
	code: string
}
