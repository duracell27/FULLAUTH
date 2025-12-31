import { Module } from '@nestjs/common'
import { AdminService } from './admin.service'
import { AdminController } from './admin.controller'
import { PrismaModule } from '@/prisma/prisma.module'
import { UserService } from '@/user/user.service'
import { PrismaService } from '@/prisma/prisma.service'

@Module({
	imports: [PrismaModule],
	controllers: [AdminController],
	providers: [AdminService, UserService, PrismaService]
})
export class AdminModule {}
