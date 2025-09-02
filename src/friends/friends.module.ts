import { Module } from '@nestjs/common'
import { FriendsService } from './friends.service'
import { FriendsController } from './friends.controller'
import { PrismaService } from '@/prisma/prisma.service'
import { UserService } from '@/user/user.service'
import { NotificationsModule } from '../notifications/notifications.module'

@Module({
	imports: [NotificationsModule],
	controllers: [FriendsController],
	providers: [FriendsService, PrismaService, UserService],
	exports: [FriendsService]
})
export class FriendsModule {}
