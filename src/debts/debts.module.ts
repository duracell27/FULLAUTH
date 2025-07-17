import { Module } from '@nestjs/common'
import { DebtsService } from './debts.service'
import { DebtsController } from './debts.controller'
import { PrismaService } from '@/prisma/prisma.service'
import { UserService } from '@/user/user.service'
import { GroupMembersService } from '@/group-members/group-members.service'
import { MailService } from '@/libs/mail/mail.service'
import { GroupsService } from '@/groups/groups.service'
import { GroupsModule } from '@/groups/groups.module'
import { FriendsModule } from '@/friends/friends.module'

@Module({
	imports: [GroupsModule, FriendsModule],
	controllers: [DebtsController],
	providers: [
		DebtsService,
		PrismaService,
		UserService,
		GroupMembersService,
		MailService,
		GroupsService
	]
})
export class DebtsModule {}
