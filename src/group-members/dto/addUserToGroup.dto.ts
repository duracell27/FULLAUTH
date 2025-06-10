import { IsNotEmpty, IsString } from 'class-validator'

export class AddUserToGroupDto {
	@IsString({ message: 'The groupId must be a string.' })
	@IsNotEmpty({ message: 'The groupId is required.' })
	groupId: string

	@IsString({ message: 'The userId must be a string.' })
	@IsNotEmpty({ message: 'The userId is required.' })
	userId: string
}
