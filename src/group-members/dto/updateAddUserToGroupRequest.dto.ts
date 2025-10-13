import { IsNotEmpty, IsString } from 'class-validator'

export class updateAddUserToGroupRequestDto {
	@IsString({ message: 'group_members.validation.group_id.string' })
	@IsNotEmpty({ message: 'group_members.validation.group_id.required' })
	groupId: string
}
