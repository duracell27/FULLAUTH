import {
	Body,
	Controller,
	Get,
	HttpCode,
	HttpStatus,
	Param,
	Patch,
	Req,
	Res
} from '@nestjs/common'
import { Request, Response } from 'express'
import { UserService } from './user.service'
import { UpdateLanguageDto } from './dto/update-language.dto'
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
	@Get('by-id-safe/:id')
	public async finByIdSafe(@Param('id') userId: string) {
		return this.userService.findByIdSafe(userId)
	}

	@Authorization()
	@HttpCode(HttpStatus.OK)
	@Get('by-name-safe')
	public findByNameSafeEmpty() {
		return []
	}

	@Authorization()
	@HttpCode(HttpStatus.OK)
	@Get('by-name-safe/:name')
	public async finByNameSafe(@Param('name') name: string) {
		if (!name || name.trim() === '') {
			return []
		}
		return this.userService.findByName(name)
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

	@Authorization()
	@HttpCode(HttpStatus.OK)
	@Patch('language')
	public async updateLanguage(
		@Authorized('id') userId: string,
		@Body() dto: UpdateLanguageDto,
		@Req() req: Request,
		@Res({ passthrough: true }) res: Response
	) {
		const updatedUser = await this.userService.updateLanguage(
			userId,
			dto.language
		)

		// Встановлюємо cookie для неавтентифікованих користувачів
		res.cookie('lang', dto.language, {
			maxAge: 31536000000, // 1 рік
			httpOnly: false,
			sameSite: 'lax'
		})

		// Встановлюємо в сесії для автентифікованих
		if (req.session) {
			// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
			;(req.session as any).lang = dto.language
		}

		return updatedUser
	}
}
