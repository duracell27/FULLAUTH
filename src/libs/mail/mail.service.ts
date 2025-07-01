import { MailerService } from '@nestjs-modules/mailer'
import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { render } from '@react-email/components'
import { ConfirmationTemplate } from './templates/confirmation.template'
import { ResetPasswordTemplate } from './templates/reset-password.template'
import { TwoFactorAuthTemplate } from './templates/two-factor-auth.template'
import { GroupAddedNotificationTemplate } from './templates/add-to-group.template'
import { GroupInvitationWithConfirmTemplate } from './templates/add-to-group-with-confirm.template'

@Injectable()
export class MailService {
	public constructor(
		private readonly mailerService: MailerService,
		private readonly configService: ConfigService
	) {}

	public async sendGroupInvitationEmail(
		email: string,
		groupName: string,
		userName: string
	) {
		const domain = this.configService.getOrThrow<string>('ALLOWED_ORIGIN')
		// eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-call
		const html = await render(
			GroupAddedNotificationTemplate({ domain, groupName, userName })
		)

		// eslint-disable-next-line @typescript-eslint/no-unsafe-return
		return this.sendMail(email, 'Group invite!', html)
	}

	public async sendGroupInvitationWithConfirmEmail(
		email: string,
		groupName: string,
		userName: string
	) {
		const domain = this.configService.getOrThrow<string>('ALLOWED_ORIGIN')
		// eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-call
		const html = await render(
			GroupInvitationWithConfirmTemplate({ domain, groupName, userName })
		)

		// eslint-disable-next-line @typescript-eslint/no-unsafe-return
		return this.sendMail(email, 'Group invite!', html)
	}

	public async sendConfirmationEmail(email: string, token: string) {
		const domain = this.configService.getOrThrow<string>('ALLOWED_ORIGIN')
		// eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-call
		const html = await render(ConfirmationTemplate({ domain, token }))

		// eslint-disable-next-line @typescript-eslint/no-unsafe-return
		return this.sendMail(email, 'Email Confirmation', html)
	}

	public async sendPasswordResetEmail(email: string, token: string) {
		const domain = this.configService.getOrThrow<string>('ALLOWED_ORIGIN')
		// eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-call
		const html = await render(ResetPasswordTemplate({ domain, token }))

		// eslint-disable-next-line @typescript-eslint/no-unsafe-return
		return this.sendMail(email, 'Password reset', html)
	}

	public async sendTwoFactorEmail(email: string, token: string) {
		// eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-call
		const html = await render(TwoFactorAuthTemplate({ token }))

		// eslint-disable-next-line @typescript-eslint/no-unsafe-return
		return this.sendMail(email, 'Two-Factor Authentication', html)
	}

	private sendMail(email: string, subject: string, html: string) {
		return this.mailerService.sendMail({
			to: email,
			subject,
			html
		})
	}
}
