import { IsString, IsNotEmpty, IsUUID } from 'class-validator'

export class CreatePersonalGroupDto {
	@IsString({ message: 'groups.validation.user_id.string' })
	@IsNotEmpty({ message: 'groups.validation.user_id.required' })
	@IsUUID(4, { message: 'groups.validation.user_id.uuid' })
	userId: string
}
