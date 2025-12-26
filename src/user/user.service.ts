import { PrismaService } from '@/prisma/prisma.service'
import {
	BadRequestException,
	Injectable,
	NotFoundException
} from '@nestjs/common'
import { I18nService, I18nContext } from 'nestjs-i18n'
import { AuthMethod } from '@prisma/client'
import { hash } from 'argon2'
import { UpdateUserDto } from './dto/update-user.dto'

@Injectable()
export class UserService {
	public constructor(
		private readonly prismaService: PrismaService,
		private readonly i18n: I18nService
	) {}

	public async findById(id: string) {
		const user = await this.prismaService.user.findUnique({
			where: {
				id
			},
			include: {
				accounts: true
			}
		})

		if (!user) {
			throw new NotFoundException(
				this.i18n.t('common.errors.user_not_found', {
					lang: I18nContext.current()?.lang
				})
			)
		}

		return user
	}

	public async findByIdSafe(id: string) {
		const user = await this.prismaService.user.findUnique({
			where: {
				id
			},
			select: {
				id: true,
				email: true,
				displayName: true,
				picture: true
			}
		})

		if (!user) {
			throw new NotFoundException(
				this.i18n.t('common.errors.user_not_found', {
					lang: I18nContext.current()?.lang
				})
			)
		}

		return user
	}

	public async findByEmail(email: string) {
		const user = await this.prismaService.user.findUnique({
			where: {
				email
			},
			include: {
				accounts: true
			}
		})

		return user
	}

	public async findByName(name: string) {
		const users = await this.prismaService.user.findMany({
			where: {
				displayName: {
					contains: name,
					mode: 'insensitive'
				}
			},
			select: {
				id: true,
				displayName: true,
				picture: true
			},
			take: 10
		})

		return users
	}

	public async create(
		email: string,
		password: string,
		displayName: string,
		picture: string,
		method: AuthMethod,
		isVerified: boolean
	) {
		const user = await this.prismaService.user.create({
			data: {
				email,
				password: password ? await hash(password) : '',
				displayName,
				picture,
				method,
				isVerified
			},
			include: {
				accounts: true
			}
		})

		return user
	}

	public async update(userId: string, dto: UpdateUserDto) {
		const user = await this.findById(userId)

		const updatedUser = await this.prismaService.user.update({
			where: {
				id: user.id
			},
			data: {
				displayName: dto.name,
				email: dto.email,
				isTwoFactorEnabled: dto.isTwoFactorEnabled
			}
		})

		return updatedUser
	}

	public async updateLanguage(
		userId: string,
		language:
			| 'EN'
			| 'UK'
			| 'DE'
			| 'ES'
			| 'FR'
			| 'CS'
			| 'PL'
			| 'TR'
			| 'HI'
			| 'ZH'
	) {
		const validLanguages = [
			'EN',
			'UK',
			'DE',
			'ES',
			'FR',
			'CS',
			'PL',
			'TR',
			'HI',
			'ZH'
		]
		if (!validLanguages.includes(language)) {
			throw new BadRequestException(
				this.i18n.t('common.errors.invalid_language', {
					lang: I18nContext.current()?.lang
				})
			)
		}
		const user = await this.findById(userId)

		if (!user) {
			throw new NotFoundException(
				this.i18n.t('common.errors.user_not_found', {
					lang: I18nContext.current()?.lang
				})
			)
		}

		const updatedUser = await this.prismaService.user.update({
			where: {
				id: user.id
			},
			data: {
				language: language
			}
		})

		return updatedUser
	}

	public async isUserExist(userId: string) {
		const user = await this.prismaService.user.findUnique({
			where: {
				id: userId
			}
		})

		return !!user
	}
}
