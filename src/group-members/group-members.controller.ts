import {
	Body,
	Controller,
	Delete,
	Get,
	HttpCode,
	HttpStatus,
	Patch,
	Post,
	Query
} from '@nestjs/common'
import { GroupMembersService } from './group-members.service'
import { Authorization } from '@/auth/decorators/auth.decorator'
import { Authorized } from '@/auth/decorators/authorized.decorator'
import { AddUserToGroupDto } from './dto/addUserToGroup.dto'
import { updateAddUserToGroupRequestDto } from './dto/updateAddUserToGroupRequest.dto'

@Controller('group-members')
export class GroupMembersController {
	constructor(private readonly groupMembersService: GroupMembersService) {}

	@Authorization()
	@HttpCode(HttpStatus.OK)
	@Get()
	public async GetUserGroups(
		@Authorized('id') userId: string,
		@Query('type') type: 'active' | 'finished',
		@Query('limit') limit?: string,
		@Query('offset') offset?: string
	) {
		const parsedLimit = limit ? parseInt(limit, 10) : 10
		const parsedOffset = offset ? parseInt(offset, 10) : 0
		return this.groupMembersService.getUserGroups(
			userId,
			type,
			parsedLimit,
			parsedOffset
		)
	}

	@Authorization()
	@HttpCode(HttpStatus.OK)
	@Get('personal')
	public async GetUserPersonalGroups(
		@Authorized('id') userId: string,
		@Query('type') type: 'active' | 'finished',
		@Query('limit') limit?: string,
		@Query('offset') offset?: string
	) {
		const parsedLimit = limit ? parseInt(limit, 10) : 10
		const parsedOffset = offset ? parseInt(offset, 10) : 0
		return this.groupMembersService.getUserPersonalGroups(
			userId,
			type,
			parsedLimit,
			parsedOffset
		)
	}

	@Authorization()
	@HttpCode(HttpStatus.OK)
	@Get('requests')
	public async GetUserGroupsRequests(@Authorized('id') userId: string) {
		return this.groupMembersService.getUserGroupRequests(userId)
	}

	@Authorization()
	@HttpCode(HttpStatus.OK)
	@Patch('requests/accept')
	public async AcceptAddGroupRequest(
		@Body() dto: updateAddUserToGroupRequestDto,
		@Authorized('id') userId: string
	) {
		return this.groupMembersService.acceptAddGroupRequest(
			dto.groupId,
			userId
		)
	}

	@Authorization()
	@HttpCode(HttpStatus.OK)
	@Patch('requests/reject')
	public async RejectAddGroupRequest(
		@Body() dto: updateAddUserToGroupRequestDto,
		@Authorized('id') userId: string
	) {
		return this.groupMembersService.rejectAddGroupRequest(
			dto.groupId,
			userId
		)
	}

	@Authorization()
	@HttpCode(HttpStatus.OK)
	@Post('add')
	public async GetUserGroupsCount(
		@Authorized('id') userId: string,
		@Body() dto: AddUserToGroupDto
	) {
		return this.groupMembersService.addUserToGroup(
			dto.groupId,
			dto.userId,
			userId
		)
	}

	@Authorization()
	@HttpCode(HttpStatus.OK)
	@Delete('')
	public async DeleteUserFromGroup(
		@Authorized('id') userId: string,
		@Body() dto: AddUserToGroupDto
	) {
		return this.groupMembersService.deleteUserFromGroup(
			dto.groupId,
			dto.userId,
			userId
		)
	}
}
