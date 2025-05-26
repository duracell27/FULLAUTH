import { Module } from '@nestjs/common'
import { GroupsService } from './groups.service'
import { GroupsController } from './groups.controller'
import { PrismaService } from '@/prisma/prisma.service'
import { UserService } from '@/user/user.service'

@Module({
	controllers: [GroupsController],
	providers: [GroupsService, PrismaService, UserService]
})
export class GroupsModule {}
