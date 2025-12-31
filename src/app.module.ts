import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import * as path from 'path'
import {
	I18nModule,
	QueryResolver,
	HeaderResolver,
	CookieResolver,
	I18nJsonLoader
} from 'nestjs-i18n'
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
import { ExpensesModule } from './expenses/expenses.module'
import { SummaryModule } from './summary/summary.module'
import { DebtsModule } from './debts/debts.module'
import { NotificationsModule } from './notifications/notifications.module'
import { UserPreferredLanguageResolver } from './i18n/language.resolver'
import { AdminModule } from './admin/admin.module'

@Module({
	imports: [
		ConfigModule.forRoot({
			isGlobal: true,
			ignoreEnvFile: !IS_DEV_ENV,
			expandVariables: true
		}),
		I18nModule.forRoot({
			fallbackLanguage: 'en',
			loader: I18nJsonLoader,
			loaderOptions: {
				path: path.join(process.cwd(), 'src/i18n/'),
				watch: true
			},
			resolvers: [
				UserPreferredLanguageResolver,
				{ use: QueryResolver, options: ['lang'] },
				{ use: CookieResolver, options: ['lang'] },
				HeaderResolver
			],
			typesOutputPath: path.join(
				process.cwd(),
				'src/generated/i18n.generated.ts'
			)
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
		GroupMembersModule,
		ExpensesModule,
		SummaryModule,
		DebtsModule,
		NotificationsModule,
		AdminModule
	],
	providers: [UserPreferredLanguageResolver]
})
export class AppModule {}
