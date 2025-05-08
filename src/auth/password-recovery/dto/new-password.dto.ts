import { IsNotEmpty, IsString, MinLength } from 'class-validator'

export class NewPasswordDto {
	@IsString({ message: 'The password must be a string.' })
	@MinLength(6, {
		message: 'The password must contain at least 6 characters.'
	})
	@IsNotEmpty({ message: 'The new password field cannot be empty.' })
	password: string
}
