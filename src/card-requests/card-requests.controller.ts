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
import { CardRequestsService } from './card-requests.service'
import { Authorization } from '@/auth/decorators/auth.decorator'
import { Authorized } from '@/auth/decorators/authorized.decorator'
import { SendCardRequestDto } from './dto/send-card-request.dto'
import { RespondCardRequestDto } from './dto/respond-card-request.dto'

@Controller('card-requests')
export class CardRequestsController {
	constructor(private readonly cardRequestsService: CardRequestsService) {}

	@Authorization()
	@HttpCode(HttpStatus.CREATED)
	@Post()
	public async sendRequest(
		@Authorized('id') requesterId: string,
		@Body() dto: SendCardRequestDto
	) {
		return this.cardRequestsService.sendRequest(requesterId, dto)
	}

	@Authorization()
	@HttpCode(HttpStatus.OK)
	@Get('received')
	public async getReceivedRequests(@Authorized('id') userId: string) {
		return this.cardRequestsService.getReceivedRequests(userId)
	}

	@Authorization()
	@HttpCode(HttpStatus.OK)
	@Get('sent')
	public async getSentRequests(@Authorized('id') userId: string) {
		return this.cardRequestsService.getSentRequests(userId)
	}

	@Authorization()
	@HttpCode(HttpStatus.OK)
	@Patch(':id')
	public async respondToRequest(
		@Authorized('id') userId: string,
		@Param('id') requestId: string,
		@Body() dto: RespondCardRequestDto
	) {
		return this.cardRequestsService.respondToRequest(requestId, userId, dto)
	}

	@Authorization()
	@HttpCode(HttpStatus.OK)
	@Delete(':id/revoke')
	public async revokeApproval(
		@Authorized('id') userId: string,
		@Param('id') requestId: string
	) {
		return this.cardRequestsService.revokeApproval(requestId, userId)
	}
}
