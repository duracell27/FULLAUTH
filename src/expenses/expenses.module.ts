import { Module, forwardRef } from '@nestjs/common'
import { ExpensesService } from './expenses.service'
import { ExpensesController } from './expenses.controller'
import { PrismaService } from '@/prisma/prisma.service'
import { UserService } from '@/user/user.service'
import { GroupMembersService } from '@/group-members/group-members.service'
import { MailService } from '@/libs/mail/mail.service'
import { FriendsService } from '@/friends/friends.service'
import { DebtsService } from '@/debts/debts.service'
import { NotificationsModule } from '../notifications/notifications.module'
import { GroupsModule } from '@/groups/groups.module'

@Module({
	imports: [NotificationsModule, forwardRef(() => GroupsModule)],
	controllers: [ExpensesController],
	providers: [
		ExpensesService,
		PrismaService,
		UserService,
		GroupMembersService,
		MailService,
		FriendsService,
		DebtsService
	]
})
export class ExpensesModule {}
