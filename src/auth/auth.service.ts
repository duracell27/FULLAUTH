/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import {
	ConflictException,
	Injectable,
	InternalServerErrorException,
	NotFoundException,
	UnauthorizedException
} from '@nestjs/common'
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

@Injectable()
export class AuthService {
	public constructor(
		private readonly userService: UserService,
		private readonly configService: ConfigService,
		private readonly providerService: ProviderService,
		private readonly prismaService: PrismaService,
		private readonly emailConfirmationService: EmailConfirmationService,
		private readonly twoFactorAuthService: TwoFactorAuthService
	) {}

	public async register(dto: RegisterDto) {
		const isExists = await this.userService.findByEmail(dto.email)
		if (isExists) {
			throw new ConflictException('User with this email already exists')
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
			message:
				'Successfully registered. Please check your email for confirmation link.'
		}
	}

	public async login(req: Request, dto: LoginDto) {
		const user = await this.userService.findByEmail(dto.email)
		if (!user || !user.password) {
			throw new NotFoundException('User not found')
		}

		const isValidPass = await verify(user.password, dto.password)

		if (!isValidPass) {
			throw new UnauthorizedException('Invalid password')
		}

		if (!user.isVerified) {
			await this.emailConfirmationService.sendVerificationToken(
				user.email
			)
			throw new UnauthorizedException('Email not verified')
		}

		if (user.isTwoFactorEnabled) {
			if (!dto.code) {
				await this.twoFactorAuthService.sendTwoFacktorToken(user.email)

				return {
					message:
						'Please enter the two-factor authentication code from your email.'
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
	) {
		const providerInstance = this.providerService.findByService(provider)!

		const profile = await providerInstance.findUserByCode(code)

		const account = await this.prismaService.account.findFirst({
			where: {
				id: profile.id,
				provider: profile.provider
			}
		})

		let user = account?.userId
			? await this.userService.findById(account.userId)
			: null

		if (user) {
			return this.saveSession(req, user)
		}

		user = await this.userService.create(
			profile.email,
			'',
			profile.name,
			profile.picture,
			// eslint-disable-next-line @typescript-eslint/no-unsafe-argument
			AuthMethod[profile.provider.toUpperCase()],
			true
		)

		if (!account) {
			await this.prismaService.account.create({
				data: {
					userId: user.id,
					type: 'oauth',
					provider: profile.provider,
					accessToken: profile.access_token,
					refreshToken: profile.refresh_token,
					expiresAt: profile.expires_at
				}
			})
		}

		return this.saveSession(req, user)
	}

	// public async logout(req: Request, res: Response): Promise<void> {
	// 	return new Promise((resolve, reject) => {
	// 		req.session.destroy(err => {
	// 			if (err) {
	// 				return reject(
	// 					new InternalServerErrorException(
	// 						'Error destroying session'
	// 					)
	// 				)
	// 			}
	// 			res.clearCookie(
	// 				this.configService.getOrThrow<string>('SESSION_NAME')
	// 			)
	// 			resolve()
	// 		})
	// 	})
	// }

	// public async logout(req: Request, res: Response): Promise<void> {
	// 	return new Promise((resolve, reject) => {
	// 		if (!req.session) {
	// 			return resolve() // Сесії немає, просто виходимо
	// 		}

	// 		req.session.destroy(err => {
	// 			if (err) {
	// 				return reject(
	// 					new InternalServerErrorException(
	// 						'Error destroying session data.'
	// 					)
	// 				)
	// 			}

	// 			const sessionName =
	// 				this.configService.getOrThrow<string>('SESSION_NAME')
	// 			const cookieOptions = {
	// 				domain: this.configService.getOrThrow<string>(
	// 					'SESSION_DOMAIN'
	// 				),
	// 				path: this.configService.get<string>('SESSION_PATH', '/'), // Якщо у вас є SESSION_PATH, інакше '/'
	// 				// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
	// 				httpOnly: this.configService.getOrThrow<boolean>(
	// 					'SESSION_HTTP_ONLY',
	// 					{ infer: true }
	// 				), // infer: true для parseBoolean
	// 				// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
	// 				secure: this.configService.getOrThrow<boolean>(
	// 					'SESSION_SECURE',
	// 					{ infer: true }
	// 				), // infer: true для parseBoolean
	// 				sameSite: this.configService.get<'lax' | 'strict' | 'none'>(
	// 					'SESSION_SAMESITE',
	// 					'lax'
	// 				) // 'lax' або з конфігу
	// 			}

	// 			res.clearCookie(sessionName, cookieOptions)

	// 			// Перевірка, чи заголовок був встановлений (це може не працювати надійно до того, як відповідь буде надіслана)
	// 			// const headers = res.getHeaders();
	// 			// this.logger.log('Response headers after clearCookie (may not be final):', headers['set-cookie']);

	// 			resolve()
	// 		})
	// 	})
	// }

	public async logout(req: Request, res: Response): Promise<void> {
		return new Promise((resolve, reject) => {
			if (!req.session) {
				return resolve() // Сесії немає, просто виходимо
			}

			req.session.destroy(err => {
				if (err) {
					return reject(
						new InternalServerErrorException(
							'Error destroying session data.'
						)
					)
				}

				const sessionName =
					this.configService.getOrThrow<string>('SESSION_NAME')
				const sessionDomain =
					this.configService.get<string>('SESSION_DOMAIN')

				// Для localhost краще не встановлювати domain
				const cookieOptions = {
					...(sessionDomain && sessionDomain !== 'localhost'
						? { domain: sessionDomain }
						: {}),
					path: this.configService.get<string>('SESSION_PATH', '/'),
					httpOnly: this.configService.getOrThrow<boolean>(
						'SESSION_HTTP_ONLY',
						{ infer: true }
					),
					secure: this.configService.getOrThrow<boolean>(
						'SESSION_SECURE',
						{ infer: true }
					),
					sameSite: this.configService.get<'lax' | 'strict' | 'none'>(
						'SESSION_SAMESITE',
						'lax'
					)
				}

				// Очищуємо cookie з точними налаштуваннями
				res.clearCookie(sessionName, cookieOptions)

				// АГРЕСИВНЕ ОЧИЩЕННЯ ДЛЯ SAFARI
				// Встановлюємо Set-Cookie заголовок вручну з минулою датою
				const pastDate = new Date(1970, 0, 1).toUTCString()
				const cookieString = `${sessionName}=; Path=${cookieOptions.path || '/'}; Expires=${pastDate}; HttpOnly${cookieOptions.secure ? '; Secure' : ''}${cookieOptions.sameSite ? `; SameSite=${cookieOptions.sameSite}` : ''}`

				res.setHeader('Set-Cookie', cookieString)

				// Альтернативно, очищуємо з різними комбінаціями параметрів
				res.clearCookie(sessionName, { path: '/' })
				res.clearCookie(sessionName, {
					path: cookieOptions.path || '/'
				})
				res.clearCookie(sessionName)

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
						new InternalServerErrorException('Error saving session')
					)
				}
				resolve({ user })
			})
		})
	}
}
