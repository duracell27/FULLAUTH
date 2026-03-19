import { IsNotEmpty, IsUUID } from 'class-validator'

export class SendCardRequestDto {
	@IsNotEmpty()
	@IsUUID()
	targetId: string
}
