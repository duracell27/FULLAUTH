import { Module } from '@nestjs/common'
import { GroupsService } from './groups.service'
import { GroupsController } from './groups.controller'
import { PrismaService } from '@/prisma/prisma.service'
import { UserService } from '@/user/user.service'
import { NotificationsModule } from '../notifications/notifications.module'

@Module({
	imports: [NotificationsModule],
	controllers: [GroupsController],
	providers: [GroupsService, PrismaService, UserService],
	exports: [GroupsService]
})
export class GroupsModule {}
