import { IsNotEmpty, IsString } from 'class-validator'

export class UpdateFriendRequestDto {
	@IsString({ message: 'The friendRequestId must be a string.' })
	@IsNotEmpty({ message: 'The friendRequestId is required.' })
	friendRequestId: string
}
