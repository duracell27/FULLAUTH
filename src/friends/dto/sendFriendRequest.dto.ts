import { IsNotEmpty, IsString } from 'class-validator'

export class SendFriendRequestDto {
	@IsString({ message: 'friends.validation.receiver_user_id.string' })
	@IsNotEmpty({ message: 'friends.validation.receiver_user_id.required' })
	recieverUserId: string
}
