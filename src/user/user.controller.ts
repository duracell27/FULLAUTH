import {
	Body,
	Controller,
	Get,
	HttpCode,
	HttpStatus,
	Param,
	Patch
} from '@nestjs/common'
import { UserService } from './user.service'
import { Authorization } from '@/auth/decorators/auth.decorator'
import { Authorized } from '@/auth/decorators/authorized.decorator'
import { UpdateUserDto } from './dto/update-user.dto'
// import { UserRole } from '@prisma/client'

@Controller('user')
export class UserController {
	constructor(private readonly userService: UserService) {}

	// @Authorization(UserRole.ADMIN)
	//@Authorized('id') так можна діставати поля з авторизованими пользователями
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

	@Authorization()
	@HttpCode(HttpStatus.OK)
	@Patch('profile')
	public async updateProfile(
		@Authorized('id') userId: string,
		@Body() dto: UpdateUserDto
	) {
		return this.userService.update(userId, dto)
	}
}
