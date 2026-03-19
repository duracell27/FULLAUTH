import { IsEnum, IsNotEmpty } from 'class-validator'

export class RespondCardRequestDto {
	@IsNotEmpty()
	@IsEnum(['APPROVED', 'DENIED'])
	status: 'APPROVED' | 'DENIED'
}
