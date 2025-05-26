import { PrismaService } from '@/prisma/prisma.service'
import { Injectable } from '@nestjs/common'
import { GroupEntity } from '@prisma/client'

type PartialGroup = Pick<GroupEntity, 'id' | 'name' | 'avatarUrl' | 'eventDate'>

@Injectable()
export class GroupMembersService {
	public constructor(public readonly prismaService: PrismaService) {}

	public async getUserGroups(userId: string): Promise<PartialGroup[]> {
		const groupMembers: { group: PartialGroup }[] =
			await this.prismaService.groupMember.findMany({
				where: { userId: userId },
				include: {
					group: {
						select: {
							id: true,
							name: true,
							avatarUrl: true,
							eventDate: true
						}
					}
				}
			})

		return groupMembers.map(member => member.group)
	}
}
