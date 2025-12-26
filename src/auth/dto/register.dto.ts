import {
	IsEmail,
	IsNotEmpty,
	IsString,
	MinLength,
	Validate
} from 'class-validator'
import { IsPasswordsMatchingConstraint } from '@/libs/common/decorators/is-passwords-matching-constraint.decorator'

export class RegisterDto {
	@IsString({ message: 'validation.name.string' })
	@IsNotEmpty({ message: 'validation.name.required' })
	name: string

	@IsString({ message: 'validation.email.string' })
	@IsEmail({}, { message: 'validation.email.invalid_format' })
	@IsNotEmpty({ message: 'validation.email.required' })
	email: string

	@IsString({ message: 'validation.password.string' })
	@IsNotEmpty({ message: 'validation.password.required' })
	@MinLength(6, {
		message: 'validation.password.min_length'
	})
	password: string

	@IsString({ message: 'validation.password_repeat.string' })
	@IsNotEmpty({ message: 'validation.password_repeat.required' })
	@MinLength(6, {
		message: 'validation.password_repeat.min_length'
	})
	@Validate(IsPasswordsMatchingConstraint, {
		message: 'validation.password_repeat.not_matching'
	})
	passwordRepeat: string
}
