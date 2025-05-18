import { Module } from '@nestjs/common'
import { FriendsService } from './friends.service'
import { FriendsController } from './friends.controller'
import { PrismaService } from '@/prisma/prisma.service'
import { UserService } from '@/user/user.service'

@Module({
	controllers: [FriendsController],
	providers: [FriendsService, PrismaService, UserService]
})
export class FriendsModule {}
