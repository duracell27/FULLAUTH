import { IsNotEmpty, IsString } from 'class-validator'

export class UpdateFriendRequestDto {
	@IsString({ message: 'friends.validation.friend_request_id.string' })
	@IsNotEmpty({ message: 'friends.validation.friend_request_id.required' })
	friendRequestId: string
}
