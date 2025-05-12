import { IsBoolean, IsEmail, IsNotEmpty, IsString } from 'class-validator'

export class UpdateUserDto {
	@IsString({ message: 'The name must be a string.' })
	@IsNotEmpty({ message: 'The name is required.' })
	name: string

	@IsString({ message: 'The email must be a string.' })
	@IsEmail({}, { message: 'Invalid email format.' })
	@IsNotEmpty({ message: 'The email is required.' })
	email: string

	@IsBoolean({ message: 'isTwoFactorEnabled must be a boolean value.' })
	isTwoFactorEnabled: boolean
}
