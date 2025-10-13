import { IsNotEmpty, IsString } from 'class-validator'

export class SettleUpDto {
	@IsString({ message: 'summary.validation.settler_user_id.string' })
	@IsNotEmpty({ message: 'summary.validation.settler_user_id.required' })
	settlerUserId: string
}
