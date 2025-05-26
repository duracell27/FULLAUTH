import { Controller, Get, HttpCode, HttpStatus } from '@nestjs/common'
import { GroupMembersService } from './group-members.service'
import { Authorization } from '@/auth/decorators/auth.decorator'
import { Authorized } from '@/auth/decorators/authorized.decorator'

@Controller('group-members')
export class GroupMembersController {
	constructor(private readonly groupMembersService: GroupMembersService) {}

	@Authorization()
	@HttpCode(HttpStatus.OK)
	@Get()
	public async GetUserGroups(@Authorized('id') userId: string) {
		return this.groupMembersService.getUserGroups(userId)
	}
}
