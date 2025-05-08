/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/require-await */
import { ConfigService } from '@nestjs/config'
import { GoogleRecaptchaModuleOptions } from '@nestlab/google-recaptcha'
import { isDev } from '@/libs/common/utils/is-dev.util'

export const getRecaptchaConfig = async (
	configService: ConfigService
): Promise<GoogleRecaptchaModuleOptions> => ({
	secretKey: configService.getOrThrow<string>('GOOGLE_RECAPTHCA_SECRET_KEY'),
	response: req => req.headers.recaptcha,
	skipIf: isDev(configService)
})
