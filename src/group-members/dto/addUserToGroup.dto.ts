import { IsNotEmpty, IsString } from 'class-validator'

export class AddUserToGroupDto {
	@IsString({ message: 'group_members.validation.group_id.string' })
	@IsNotEmpty({ message: 'group_members.validation.group_id.required' })
	groupId: string

	@IsString({ message: 'group_members.validation.user_id.string' })
	@IsNotEmpty({ message: 'group_members.validation.user_id.required' })
	userId: string
}
