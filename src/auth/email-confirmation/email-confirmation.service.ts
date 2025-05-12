import { PrismaService } from '@/prisma/prisma.service'
import {
	BadRequestException,
	forwardRef,
	Inject,
	Injectable,
	NotFoundException
} from '@nestjs/common'
import { TokenType } from '@prisma/client'
import { Request } from 'express'
import { v4 as uuidv4 } from 'uuid'
import { ConfirmationDto } from './dto/confirmation.dto'
import { MailService } from '@/libs/mail/mail.service'
import { UserService } from '@/user/user.service'
import { AuthService } from '../auth.service'

@Injectable()
export class EmailConfirmationService {
	public constructor(
		private readonly prismaService: PrismaService,
		private readonly mailService: MailService,
		private readonly userService: UserService,
		@Inject(forwardRef(() => AuthService))
		private readonly authService: AuthService
	) {}

	public async newVerification(req: Request, dto: ConfirmationDto) {
		const existingToken = await this.prismaService.token.findUnique({
			where: {
				token: dto.token,
				type: TokenType.VERIFIFCATION
			}
		})

		if (!existingToken) {
			throw new NotFoundException('Token not found')
		}

		const hasExpired = new Date(existingToken.expiresIn) < new Date()

		if (hasExpired) {
			throw new BadRequestException('Token has expired')
		}

		const existingUser = await this.userService.findByEmail(
			existingToken.email
		)

		if (!existingUser) {
			throw new NotFoundException('User not found')
		}

		await this.prismaService.user.update({
			where: {
				id: existingUser.id
			},
			data: {
				isVerified: true
			}
		})

		await this.prismaService.token.delete({
			where: {
				id: existingToken.id,
				type: TokenType.VERIFIFCATION
			}
		})

		return this.authService.saveSession(req, existingUser)
	}

	public async sendVerificationToken(email: string) {
		const verificationToken = await this.generateVerificationToken(email)

		await this.mailService.sendConfirmationEmail(
			verificationToken.email,
			verificationToken.token
		)

		return true
	}

	private async generateVerificationToken(email: string) {
		const token = uuidv4()
		const expiresIn = new Date(new Date().getTime() + 1000 * 3600)

		const existingToken = await this.prismaService.token.findFirst({
			where: {
				email,
				type: TokenType.VERIFIFCATION
			}
		})

		if (existingToken) {
			await this.prismaService.token.delete({
				where: {
					id: existingToken.id,
					type: TokenType.VERIFIFCATION
				}
			})
		}

		const verificationToken = await this.prismaService.token.create({
			data: {
				email,
				token,
				type: TokenType.VERIFIFCATION,
				expiresIn
			}
		})

		return verificationToken
	}
}
