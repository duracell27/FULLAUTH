import { BadRequestException, Injectable } from '@nestjs/common'
import { CreateGroupDto } from './dto/CreateGroupDto'
import { PrismaService } from '@/prisma/prisma.service'
import { UpdateGroupDto } from './dto/UpdateGroupDto'

@Injectable()
export class GroupsService {
	public constructor(private readonly prismaService: PrismaService) {}

	public async createGroup(userId: string, dto: CreateGroupDto) {
		const group = await this.prismaService.groupEntity.create({
			data: {
				name: dto.name,
				avatarUrl: dto.avatarUrl,
				eventDate: dto.eventDate
			}
		})

		await this.prismaService.groupMember.create({
			data: {
				userId: userId,
				groupId: group.id,
				role: 'ADMIN'
			}
		})

		return group
	}

	public async updateGroup(userId: string, dto: UpdateGroupDto) {
		//todo: check if user is admin of group
		const userGroupAdmin = await this.prismaService.groupMember.findFirst({
			where: {
				userId: userId,
				groupId: dto.groupId,
				role: 'ADMIN'
			}
		})

		if (!userGroupAdmin) {
			throw new BadRequestException('You are not admin of this group')
		}

		const group = await this.prismaService.groupEntity.update({
			where: {
				id: dto.groupId
			},
			data: {
				name: dto.name,
				avatarUrl: dto.avatarUrl,
				eventDate: dto.eventDate,
				isLocked: dto.isLocked,
				isFinished: dto.isFinished
			}
		})

		return group
	}

	public async deleteGroup(groupId: string, userId: string) {
		const userGroupAdmin = await this.prismaService.groupMember.findFirst({
			where: {
				userId: userId,
				groupId: groupId,
				role: 'ADMIN'
			}
		})

		if (!userGroupAdmin) {
			throw new BadRequestException('You are not admin of this group')
		}

		await this.prismaService.groupEntity.delete({
			where: {
				id: groupId
			}
		})

		await this.prismaService.groupMember.deleteMany({
			where: {
				groupId: groupId
			}
		})

		return true
	}
}
