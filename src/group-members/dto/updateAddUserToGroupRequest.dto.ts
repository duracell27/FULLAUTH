import { IsNotEmpty, IsString } from 'class-validator'

export class updateAddUserToGroupRequestDto {
	@IsString({ message: 'The groupId must be a string.' })
	@IsNotEmpty({ message: 'The groupId is required.' })
	groupId: string
}
