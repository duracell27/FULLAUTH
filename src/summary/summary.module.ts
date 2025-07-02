import { Module } from '@nestjs/common'
import { SummaryService } from './summary.service'
import { SummaryController } from './summary.controller'
import { PrismaService } from '@/prisma/prisma.service'
import { UserService } from '@/user/user.service'

@Module({
	controllers: [SummaryController],
	providers: [SummaryService, PrismaService, UserService]
})
export class SummaryModule {}
