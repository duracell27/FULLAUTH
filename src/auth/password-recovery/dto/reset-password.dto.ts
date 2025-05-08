import { IsEmail, IsNotEmpty } from 'class-validator'

export class ResetPasswordDto {
	@IsEmail({}, { message: 'Enter a valid email address.' })
	@IsNotEmpty({ message: 'The email field cannot be empty.' })
	email: string
}
