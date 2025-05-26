import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { IS_DEV_ENV } from '@/libs/common/utils/is-dev.util'
import { PrismaModule } from './prisma/prisma.module'
import { AuthModule } from './auth/auth.module'
import { UserModule } from './user/user.module'
import { ProviderModule } from './auth/provider/provider.module'
import { MailModule } from './libs/mail/mail.module'
import { EmailConfirmationModule } from './auth/email-confirmation/email-confirmation.module'
import { PasswordRecoveryModule } from './auth/password-recovery/password-recovery.module'
import { TwoFactorAuthModule } from './auth/two-factor-auth/two-factor-auth.module'
import { FriendsModule } from './friends/friends.module'
import { GroupsModule } from './groups/groups.module'
import { GroupMembersModule } from './group-members/group-members.module'

@Module({
	imports: [
		ConfigModule.forRoot({
			isGlobal: true,
			ignoreEnvFile: !IS_DEV_ENV
		}),
		PrismaModule,
		AuthModule,
		UserModule,
		ProviderModule,
		MailModule,
		EmailConfirmationModule,
		PasswordRecoveryModule,
		TwoFactorAuthModule,
		FriendsModule,
		GroupsModule,
		GroupMembersModule
	]
})
export class AppModule {}
