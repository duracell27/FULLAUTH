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
import { GroupsService } from './groups.service'
import { Authorization } from '@/auth/decorators/auth.decorator'
import { Authorized } from '@/auth/decorators/authorized.decorator'
import { CreateGroupDto } from './dto/CreateGroupDto'
import { CreatePersonalGroupDto } from './dto/CreatePersonalGroupDto'
import { UpdateGroupDto } from './dto/UpdateGroupDto'

@Controller('groups')
export class GroupsController {
	constructor(private readonly groupsService: GroupsService) {}

	@Authorization()
	@HttpCode(HttpStatus.OK)
	@Get('/:groupId')
	public async getGroupInfo(
		@Param('groupId') groupId: string,
		@Authorized('id') userId: string
	) {
		return this.groupsService.getGroupInfo(groupId, userId)
	}

	@Authorization()
	@HttpCode(HttpStatus.OK)
	@Get('/:groupId/public')
	public async getPublicGroupInfo(
		@Param('groupId') groupId: string,
		@Authorized('id') userId: string
	) {
		return this.groupsService.getPublicGroupInfo(groupId, userId)
	}

	@Authorization()
	@HttpCode(HttpStatus.OK)
	@Post('create')
	public async createGroup(
		@Authorized('id') userId: string,
		@Body() dto: CreateGroupDto
	) {
		return this.groupsService.createGroup(userId, dto)
	}

	@Authorization()
	@HttpCode(HttpStatus.OK)
	@Post('create-personal')
	public async createPersonalGroup(
		@Authorized('id') userId: string,
		@Body() dto: CreatePersonalGroupDto
	) {
		return this.groupsService.createPersonalGroup(userId, dto)
	}

	@Authorization()
	@HttpCode(HttpStatus.OK)
	@Patch('update')
	public async updateGroup(
		@Authorized('id') userId: string,
		@Body() dto: UpdateGroupDto
	) {
		return this.groupsService.updateGroup(userId, dto)
	}

	@Authorization()
	@HttpCode(HttpStatus.OK)
	@Delete('/:groupId')
	public async deleteGroup(
		@Param('groupId') groupId: string,
		@Authorized('id') userId: string
	) {
		return this.groupsService.deleteGroup(groupId, userId)
	}

	@Authorization()
	@HttpCode(HttpStatus.OK)
	@Post('/:groupId/simplify-debts')
	public async simplifyDebts(
		@Param('groupId') groupId: string,
		@Authorized('id') userId: string
	) {
		return this.groupsService.enableDebtSimplification(groupId, userId)
	}

	@Authorization()
	@HttpCode(HttpStatus.OK)
	@Post('/:groupId/join-request')
	public async requestToJoin(
		@Param('groupId') groupId: string,
		@Authorized('id') userId: string
	) {
		return this.groupsService.requestToJoin(groupId, userId)
	}

	@Authorization()
	@HttpCode(HttpStatus.OK)
	@Patch('/:groupId/join-request/:requesterId/accept')
	public async acceptJoinRequest(
		@Param('groupId') groupId: string,
		@Param('requesterId') requesterId: string,
		@Authorized('id') adminId: string
	) {
		return this.groupsService.respondToJoinRequest(
			groupId,
			requesterId,
			adminId,
			true
		)
	}

	@Authorization()
	@HttpCode(HttpStatus.OK)
	@Patch('/:groupId/join-request/:requesterId/reject')
	public async rejectJoinRequest(
		@Param('groupId') groupId: string,
		@Param('requesterId') requesterId: string,
		@Authorized('id') adminId: string
	) {
		return this.groupsService.respondToJoinRequest(
			groupId,
			requesterId,
			adminId,
			false
		)
	}
}
