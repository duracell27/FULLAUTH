import { Controller, Get, HttpCode, HttpStatus, Param } from '@nestjs/common'
import { UserService } from './user.service'
import { Authorization } from '@/auth/decorators/auth.decorator'
import { Authorized } from '@/auth/decorators/authorized.decorator'
// import { UserRole } from '@prisma/client'

@Controller('user')
export class UserController {
	constructor(private readonly userService: UserService) {}

	// @Authorization(UserRole.ADMIN)
	@Authorization()
	@HttpCode(HttpStatus.OK)
	@Get('profile')
	public async getProfile(@Authorized('id') userId: string) {
		return this.userService.findById(userId)
	}

	@Authorization()
	@HttpCode(HttpStatus.OK)
	@Get('by-id/:id')
	public async finById(@Param('id') userId: string) {
		return this.userService.findById(userId)
	}
}
