import { Module, forwardRef } from '@nestjs/common'
import { GroupsService } from './groups.service'
import { GroupsController } from './groups.controller'
import { PrismaService } from '@/prisma/prisma.service'
import { UserService } from '@/user/user.service'
import { NotificationsModule } from '../notifications/notifications.module'
import { ExpensesModule } from '@/expenses/expenses.module'

@Module({
	imports: [NotificationsModule, forwardRef(() => ExpensesModule)],
	controllers: [GroupsController],
	providers: [GroupsService, PrismaService, UserService],
	exports: [GroupsService]
})
export class GroupsModule {}
