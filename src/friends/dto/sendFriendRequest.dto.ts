import { IsNotEmpty, IsString } from 'class-validator'

export class SendFriendRequestDto {
	@IsString({ message: 'The userId must be a string.' })
	@IsNotEmpty({ message: 'The userId is required.' })
	recieverUserId: string
}
