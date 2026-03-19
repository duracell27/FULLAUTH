import {
	BadRequestException,
	Injectable,
	NotFoundException
} from '@nestjs/common'
import { CardRequestStatus, CardVisibility } from '@prisma/client'
import { PrismaService } from '@/prisma/prisma.service'
import { NotificationsService } from '@/notifications/notifications.service'
import { I18nService, I18nContext } from 'nestjs-i18n'
import { SendCardRequestDto } from './dto/send-card-request.dto'
import { RespondCardRequestDto } from './dto/respond-card-request.dto'

@Injectable()
export class CardRequestsService {
	public constructor(
		private readonly prismaService: PrismaService,
		private readonly notificationsService: NotificationsService,
		private readonly i18n: I18nService
	) {}

	public async sendRequest(requesterId: string, dto: SendCardRequestDto) {
		const { targetId } = dto

		if (requesterId === targetId) {
			throw new BadRequestException('Cannot send request to yourself')
		}

		const target = await this.prismaService.user.findUnique({
			where: { id: targetId },
			select: { id: true, displayName: true, cardVisibility: true }
		})

		if (!target) {
			throw new NotFoundException('User not found')
		}

		if (target.cardVisibility !== CardVisibility.ON_REQUEST) {
			throw new BadRequestException(
				'This user does not require a request to view their card'
			)
		}

		const existing = await this.prismaService.cardRequest.findUnique({
			where: { requesterId_targetId: { requesterId, targetId } }
		})

		if (existing?.status === CardRequestStatus.PENDING) {
			throw new BadRequestException('Request is already pending')
		}

		if (existing?.status === CardRequestStatus.APPROVED) {
			throw new BadRequestException('Request is already approved')
		}

		const requester = await this.prismaService.user.findUnique({
			where: { id: requesterId },
			select: { displayName: true }
		})

		if (existing?.status === CardRequestStatus.DENIED) {
			const updated = await this.prismaService.cardRequest.update({
				where: { requesterId_targetId: { requesterId, targetId } },
				data: { status: CardRequestStatus.PENDING }
			})

			await this.notificationsService.createCardRequestNotification(
				targetId,
				requesterId,
				requester!.displayName
			)

			return updated
		}

		const request = await this.prismaService.cardRequest.create({
			data: { requesterId, targetId }
		})

		await this.notificationsService.createCardRequestNotification(
			targetId,
			requesterId,
			requester!.displayName
		)

		return request
	}

	public async getReceivedRequests(userId: string) {
		return this.prismaService.cardRequest.findMany({
			where: { targetId: userId },
			orderBy: { createdAt: 'desc' },
			include: {
				requester: {
					select: {
						id: true,
						displayName: true,
						picture: true
					}
				}
			}
		})
	}

	public async getSentRequests(userId: string) {
		return this.prismaService.cardRequest.findMany({
			where: { requesterId: userId },
			orderBy: { createdAt: 'desc' },
			include: {
				target: {
					select: {
						id: true,
						displayName: true,
						picture: true
					}
				}
			}
		})
	}

	public async respondToRequest(
		requestId: string,
		userId: string,
		dto: RespondCardRequestDto
	) {
		const request = await this.prismaService.cardRequest.findFirst({
			where: { id: requestId, targetId: userId },
			include: {
				target: { select: { displayName: true } }
			}
		})

		if (!request) {
			throw new NotFoundException('Request not found')
		}

		if (request.status !== CardRequestStatus.PENDING) {
			throw new BadRequestException('Request is already responded to')
		}

		const updated = await this.prismaService.cardRequest.update({
			where: { id: requestId },
			data: { status: dto.status }
		})

		if (dto.status === CardRequestStatus.APPROVED) {
			await this.notificationsService.createCardRequestApprovedNotification(
				request.requesterId,
				request.target.displayName
			)
		} else {
			await this.notificationsService.createCardRequestDeniedNotification(
				request.requesterId,
				request.target.displayName
			)
		}

		return updated
	}

	public async revokeApproval(requestId: string, userId: string) {
		const request = await this.prismaService.cardRequest.findFirst({
			where: {
				id: requestId,
				targetId: userId,
				status: CardRequestStatus.APPROVED
			}
		})

		if (!request) {
			throw new NotFoundException('Approved request not found')
		}

		return this.prismaService.cardRequest.update({
			where: { id: requestId },
			data: { status: CardRequestStatus.DENIED }
		})
	}
}
