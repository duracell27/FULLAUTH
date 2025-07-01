import { Module } from '@nestjs/common'
import { GroupMembersService } from './group-members.service'
import { GroupMembersController } from './group-members.controller'
import { PrismaService } from '@/prisma/prisma.service'
import { UserService } from '@/user/user.service'
import { GroupsService } from '@/groups/groups.service'
import { FriendsService } from '@/friends/friends.service'
import { MailService } from '@/libs/mail/mail.service'

@Module({
	controllers: [GroupMembersController],
	providers: [
		GroupMembersService,
		PrismaService,
		UserService,
		GroupsService,
		FriendsService,
		MailService
	]
})
export class GroupMembersModule {}
