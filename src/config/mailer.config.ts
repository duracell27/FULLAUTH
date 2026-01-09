/* eslint-disable @typescript-eslint/require-await */
import { isDev } from '@/libs/common/utils/is-dev.util'
import { MailerOptions } from '@nestjs-modules/mailer'
import { ConfigService } from '@nestjs/config'

export const getMailerConfig = async (
	configService: ConfigService
): Promise<MailerOptions> => ({
	transport: {
		host: configService.getOrThrow<string>('MAIL_HOST'),
		port: configService.getOrThrow<number>('MAIL_PORT'),
		secure: !isDev(configService),
		auth: {
			user: configService.getOrThrow<string>('MAIL_LOGIN'),
			pass: configService.getOrThrow<string>('MAIL_PASSWORD')
		},
		pool: true,
		logger: false
	},
	defaults: {
		from: `"Shmidt Team" ${configService.getOrThrow<string>('MAIL_LOGIN')}`
	},
	preview: isDev(configService)
})
