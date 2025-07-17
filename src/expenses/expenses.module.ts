import { Module } from '@nestjs/common'
import { ExpensesService } from './expenses.service'
import { ExpensesController } from './expenses.controller'
import { PrismaService } from '@/prisma/prisma.service'
import { UserService } from '@/user/user.service'
import { GroupMembersService } from '@/group-members/group-members.service'
import { GroupsService } from '@/groups/groups.service'
import { MailService } from '@/libs/mail/mail.service'
import { FriendsService } from '@/friends/friends.service'
import { DebtsService } from '@/debts/debts.service'

@Module({
	controllers: [ExpensesController],
	providers: [
		ExpensesService,
		PrismaService,
		UserService,
		GroupMembersService,
		MailService,
		GroupsService,
		FriendsService,
		DebtsService
	]
})
export class ExpensesModule {}
