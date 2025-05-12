import { MailService } from '@/libs/mail/mail.service'
import { PrismaService } from '@/prisma/prisma.service'
import {
	BadRequestException,
	Injectable,
	NotFoundException
} from '@nestjs/common'
import { TokenType } from '@prisma/client'

@Injectable()
export class TwoFactorAuthService {
	public constructor(
		private readonly prismaService: PrismaService,
		private readonly mailService: MailService
	) {}

	public async validateTwoFactorToken(email: string, code: string) {
		const existingToken = await this.prismaService.token.findFirst({
			where: {
				email,
				type: TokenType.TWO_FACTOR
			}
		})

		if (!existingToken) {
			throw new NotFoundException(
				'Token for two-factor authentication not found'
			)
		}

		if (existingToken.token !== code) {
			throw new BadRequestException(
				'Invalid two-factor authentication code'
			)
		}

		const hasExpired = new Date(existingToken.expiresIn) < new Date()

		if (hasExpired) {
			throw new BadRequestException('Two-factor token has expired')
		}

		await this.prismaService.token.delete({
			where: {
				id: existingToken.id,
				type: TokenType.TWO_FACTOR
			}
		})

		return true
	}

	public async sendTwoFacktorToken(email: string) {
		const twoFactorToken = await this.generateTwoFactorToken(email)

		await this.mailService.sendTwoFactorEmail(
			twoFactorToken.email,
			twoFactorToken.token
		)

		return true
	}

	private async generateTwoFactorToken(email: string) {
		const token = Math.floor(
			Math.random() * (1000000 - 100000) + 100000
		).toString()
		const expiresIn = new Date(new Date().getTime() + 300000)

		const existingToken = await this.prismaService.token.findFirst({
			where: {
				email,
				type: TokenType.TWO_FACTOR
			}
		})

		if (existingToken) {
			await this.prismaService.token.delete({
				where: {
					id: existingToken.id,
					type: TokenType.TWO_FACTOR
				}
			})
		}

		const twoFactorToken = await this.prismaService.token.create({
			data: {
				email,
				token,
				type: TokenType.TWO_FACTOR,
				expiresIn
			}
		})

		return twoFactorToken
	}
}
