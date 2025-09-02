import { Module } from '@nestjs/common'
import { NotificationsService } from './notifications.service'
import { NotificationsController } from './notifications.controller'
import { PrismaModule } from '../prisma/prisma.module'
import { UserService } from '@/user/user.service'
import { PrismaService } from '@/prisma/prisma.service'

@Module({
	imports: [PrismaModule],
	controllers: [NotificationsController],
	providers: [NotificationsService, UserService, PrismaService],
	exports: [NotificationsService]
})
export class NotificationsModule {}
