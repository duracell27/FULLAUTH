import {
	Body,
	Controller,
	Delete,
	Get,
	HttpCode,
	HttpStatus,
	Param,
	Patch,
	Post
} from '@nestjs/common'
import { FriendsService } from './friends.service'
import { Authorization } from '@/auth/decorators/auth.decorator'
import { Authorized } from '@/auth/decorators/authorized.decorator'
import { SendFriendRequestDto } from './dto/sendFriendRequest.dto'
import { UpdateFriendRequestDto } from './dto/updateFriendRequest.dto'

@Controller('friends')
export class FriendsController {
	constructor(private readonly friendsService: FriendsService) {}

	@Authorization()
	@HttpCode(HttpStatus.OK)
	@Get()
	public async getUserFriends(@Authorized('id') userId: string) {
		return this.friendsService.getUserFriends(userId)
	}

	@Authorization()
	@HttpCode(HttpStatus.OK)
	@Post('add')
	public async sendFriendRequest(
		@Authorized('id') userId: string,
		@Body() dto: SendFriendRequestDto
	) {
		return this.friendsService.sendFriendRequest(dto.recieverUserId, userId)
	}

	@Authorization()
	@HttpCode(HttpStatus.OK)
	@Patch('accept')
	public async acceptFriendRequest(
		@Authorized('id') userId: string,
		@Body() dto: UpdateFriendRequestDto
	) {
		return this.friendsService.acceptFriendRequest(
			dto.friendRequestId,
			userId
		)
	}

	@Authorization()
	@HttpCode(HttpStatus.OK)
	@Patch('reject')
	public async rejectFriendRequest(
		@Authorized('id') userId: string,
		@Body() dto: UpdateFriendRequestDto
	) {
		return this.friendsService.rejectFriendRequest(
			dto.friendRequestId,
			userId
		)
	}

	@Authorization()
	@HttpCode(HttpStatus.OK)
	@Delete('/:friendRequestId')
	public async cancelFriendRequest(
		@Authorized('id') userId: string,
		@Param('friendRequestId') friendRequestId: string
	) {
		return this.friendsService.cancelFriendRequest(friendRequestId, userId)
	}
}
