/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import {
	ConflictException,
	Injectable,
	InternalServerErrorException,
	NotFoundException,
	UnauthorizedException
} from '@nestjs/common'
import { I18nService, I18nContext } from 'nestjs-i18n'
import { RegisterDto } from './dto/register.dto'
import { UserService } from '@/user/user.service'
import { AuthMethod, User } from '@prisma/client'
import { Request, Response } from 'express'
import { LoginDto } from './dto/login.dto'
import { verify } from 'argon2'
import { ConfigService } from '@nestjs/config'
import { ProviderService } from './provider/provider.service'
import { PrismaService } from '@/prisma/prisma.service'
import { EmailConfirmationService } from './email-confirmation/email-confirmation.service'
import { TwoFactorAuthService } from './two-factor-auth/two-factor-auth.service'
import { parseBoolean } from '@/libs/common/utils/parse-boolean'

@Injectable()
export class AuthService {
	public constructor(
		private readonly userService: UserService,
		private readonly configService: ConfigService,
		private readonly providerService: ProviderService,
		private readonly prismaService: PrismaService,
		private readonly emailConfirmationService: EmailConfirmationService,
		private readonly twoFactorAuthService: TwoFactorAuthService,
		private readonly i18n: I18nService
	) {}

	public async register(dto: RegisterDto) {
		const isExists = await this.userService.findByEmail(dto.email)
		if (isExists) {
			throw new ConflictException(
				this.i18n.t('common.auth.register.user_exists', {
					lang: I18nContext.current()?.lang
				})
			)
		}

		const newUser = await this.userService.create(
			dto.email,
			dto.password,
			dto.name,
			'',
			AuthMethod.CREDENTIALS,
			false
		)

		await this.emailConfirmationService.sendVerificationToken(newUser.email)

		return {
			message: this.i18n.t('common.auth.register.success', {
				lang: I18nContext.current()?.lang
			})
		}
	}

	public async login(req: Request, dto: LoginDto) {
		const user = await this.userService.findByEmail(dto.email)
		if (!user || !user.password) {
			throw new NotFoundException(
				this.i18n.t('common.auth.login.user_not_found', {
					lang: I18nContext.current()?.lang
				})
			)
		}

		const isValidPass = await verify(user.password, dto.password)

		if (!isValidPass) {
			throw new UnauthorizedException(
				this.i18n.t('common.auth.login.invalid_password', {
					lang: I18nContext.current()?.lang
				})
			)
		}

		if (!user.isVerified) {
			await this.emailConfirmationService.sendVerificationToken(
				user.email
			)
			throw new UnauthorizedException(
				this.i18n.t('common.auth.login.email_not_verified', {
					lang: I18nContext.current()?.lang
				})
			)
		}

		if (user.isTwoFactorEnabled) {
			if (!dto.code) {
				await this.twoFactorAuthService.sendTwoFacktorToken(user.email)

				return {
					message: this.i18n.t(
						'common.auth.login.two_factor_required',
						{
							lang: I18nContext.current()?.lang
						}
					)
				}
			}

			await this.twoFactorAuthService.validateTwoFactorToken(
				user.email,
				dto.code
			)
		}

		return this.saveSession(req, user)
	}

	public async extractProfileFromCode(
		req: Request,
		provider: string,
		code: string
	): Promise<{ user: User }> {
		const providerInstance = this.providerService.findByService(provider)!

		const profile = await providerInstance.findUserByCode(code)

		// Спочатку перевіряємо, чи існує користувач з таким email
		const existingUser = await this.userService.findByEmail(profile.email)

		// Якщо користувач існує, але не має акаунту для цього провайдера
		if (existingUser) {
			// Перевіряємо, чи вже є акаунт для цього провайдера
			const account = await this.prismaService.account.findFirst({
				where: {
					userEmail: profile.email,
					provider: profile.provider
				}
			})

			// Якщо акаунту немає, створюємо його
			if (!account) {
				await this.prismaService.account.create({
					data: {
						userId: existingUser.id,
						type: 'oauth',
						userEmail: profile.email,
						provider: profile.provider,
						accessToken: profile.access_token,
						refreshToken: profile.refresh_token,
						expiresAt: profile.expires_at
					}
				})
			}

			return this.saveSession(req, existingUser) as Promise<{
				user: User
			}>
		}

		// Якщо користувача не існує, створюємо нового
		const user = await this.userService.create(
			profile.email,
			'',
			profile.name,
			profile.picture,
			// eslint-disable-next-line @typescript-eslint/no-unsafe-argument
			AuthMethod[profile.provider.toUpperCase()],
			true
		)

		// Створюємо акаунт для нового користувача
		await this.prismaService.account.create({
			data: {
				userId: user.id,
				type: 'oauth',
				userEmail: profile.email,
				provider: profile.provider,
				accessToken: profile.access_token,
				refreshToken: profile.refresh_token,
				expiresAt: profile.expires_at
			}
		})

		return this.saveSession(req, user) as Promise<{
			user: User
		}>
	}

	public async logout(req: Request, res: Response): Promise<void> {
		return new Promise((resolve, reject) => {
			if (!req.session) {
				return resolve() // Сесії немає, просто виходимо
			}

			req.session.destroy(err => {
				if (err) {
					return reject(
						new InternalServerErrorException(
							this.i18n.t('common.auth.session.destroy_error', {
								lang: I18nContext.current()?.lang
							})
						)
					)
				}

				const sessionName =
					this.configService.getOrThrow<string>('SESSION_NAME')

				// Не передаємо domain взагалі для logout
				const cookieOptions: any = {
					path: this.configService.get<string>('SESSION_PATH', '/'),
					httpOnly: parseBoolean(
						this.configService.getOrThrow<string>('SESSION_HTTP_ONLY')
					),
					secure: parseBoolean(
						this.configService.getOrThrow<string>('SESSION_SECURE')
					),
					sameSite: 'lax' as const,
					expires: new Date(0),
					maxAge: 0
				}

				res.clearCookie(sessionName, cookieOptions)

				// Додатково встановлюємо cookie з порожнім значенням
				res.cookie(sessionName, '', cookieOptions)

				resolve()
			})
		})
	}

	public async saveSession(req: Request, user: User) {
		return new Promise((resolve, reject) => {
			req.session.userId = user.id

			req.session.save(err => {
				if (err) {
					return reject(
						new InternalServerErrorException(
							this.i18n.t('common.auth.session.save_error', {
								lang: I18nContext.current()?.lang
							})
						)
					)
				}
				resolve({ user })
			})
		})
	}
}
