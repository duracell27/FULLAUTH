/* eslint-disable @typescript-eslint/require-await */
import { ConfigService } from '@nestjs/config'

import { GoogleProvider } from '@/auth/provider/services/google.provider'
import { TypeOptions } from '@/auth/provider/provider-constants'

export const getProvidersConfig = async (
	configService: ConfigService
): Promise<TypeOptions> => ({
	baseUrl: configService.getOrThrow<string>('APPLICATION_URL'),
	services: [
		new GoogleProvider({
			client_id: configService.getOrThrow<string>('GOOGLE_CLIENT_ID'),
			client_secret: configService.getOrThrow<string>(
				'GOOGLE_CLIENT_SECRET'
			),
			scopes: ['email', 'profile']
		})
	]
})
