import {
	IsEmail,
	IsNotEmpty,
	IsOptional,
	IsString,
	MinLength
} from 'class-validator'

export class LoginDto {
	@IsString({ message: 'Email має бути рядком.' })
	@IsEmail({}, { message: 'Некоректний формат email.' })
	@IsNotEmpty({ message: 'Email є обов’язковим для заповнення.' })
	email: string

	@IsString({ message: 'Пароль має бути рядком.' })
	@IsNotEmpty({ message: 'Поле пароль не може бути порожнім.' })
	@MinLength(6, { message: 'Пароль має містити не менше 6 символів.' })
	password: string

	@IsOptional()
	@IsString()
	code: string
}
