import { Module } from '@nestjs/common'
import { AuthService } from './auth.service'
import { AuthController } from './auth.controller'
import { UserService } from '@/user/user.service'
import { GoogleRecaptchaModule } from '@nestlab/google-recaptcha'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { getRecaptchaConfig } from '@/config/recaptcha.config'
import { getProvidersConfig } from '@/config/providers.config'
import { ProviderModule } from './provider/provider.module'

@Module({
	imports: [
		ProviderModule.registerAsync({
			imports: [ConfigModule],
			useFactory: getProvidersConfig,
			inject: [ConfigService]
		}),
		GoogleRecaptchaModule.forRootAsync({
			imports: [ConfigModule],
			inject: [ConfigService],
			useFactory: getRecaptchaConfig
		})
	],
	controllers: [AuthController],
	providers: [AuthService, UserService]
})
export class AuthModule {}
