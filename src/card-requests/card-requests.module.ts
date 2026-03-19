import { Module } from '@nestjs/common'
import { CardRequestsService } from './card-requests.service'
import { CardRequestsController } from './card-requests.controller'
import { PrismaService } from '@/prisma/prisma.service'
import { UserService } from '@/user/user.service'
import { NotificationsModule } from '@/notifications/notifications.module'

@Module({
	imports: [NotificationsModule],
	controllers: [CardRequestsController],
	providers: [CardRequestsService, PrismaService, UserService],
	exports: [CardRequestsService]
})
export class CardRequestsModule {}
