import { Module } from '@nestjs/common'
import { GroupMembersService } from './group-members.service'
import { GroupMembersController } from './group-members.controller'
import { PrismaService } from '@/prisma/prisma.service'
import { UserService } from '@/user/user.service'

@Module({
	controllers: [GroupMembersController],
	providers: [GroupMembersService, PrismaService, UserService]
})
export class GroupMembersModule {}
