import { PrismaService } from '@/prisma/prisma.service'
import {
	Injectable,
	NotFoundException,
	BadRequestException
} from '@nestjs/common'
import { GroupDebtPaymentDto } from './dto/group-debt-payment.dto'
import { DebtStatus } from '@prisma/client'
import { GroupMembersService } from '@/group-members/group-members.service'

@Injectable()
export class DebtsService {
	public constructor(
		private readonly prismaService: PrismaService,
		private readonly groupMembersService: GroupMembersService
	) {}

	async addDebtPay(dto: GroupDebtPaymentDto, userId: string) {
		const amountLeft = dto.amount
		if (amountLeft <= 0)
			throw new BadRequestException('Amount must be positive')

		const isUserGroupMember =
			await this.groupMembersService.isUserGroupMember(
				userId,
				dto.groupId
			)

		if (!isUserGroupMember)
			throw new BadRequestException('You are not a member of this group')

		// Знаходимо всі борги користувача в групі зі статусом PENDING
		const debts = await this.prismaService.debt.findMany({
			where: {
				debtorId: dto.debtorId, // ви — боржник
				creditorId: dto.creditorId, // кому ви винні
				status: DebtStatus.PENDING,
				expense: {
					groupId: dto.groupId
				}
			},
			orderBy: { createdAt: 'asc' }
		})

		if (!debts.length)
			throw new NotFoundException('No pending debts found in this group')

		const sumOfDebts = debts.reduce((sum, debt) => sum + debt.remaining, 0)
		if (sumOfDebts < amountLeft)
			throw new BadRequestException(
				'Amount is greater than the sum of all debts'
			)

		await this.prismaService.$transaction(async tx => {
			let localAmountLeft = amountLeft
			for (const debt of debts) {
				if (localAmountLeft <= 0) break
				const payAmount = Math.min(debt.remaining, localAmountLeft)

				// Створити платіж
				await tx.debtPayment.create({
					data: { debtId: debt.id, amount: payAmount }
				})

				// Оновити борг
				const newRemaining = debt.remaining - payAmount
				const status = newRemaining <= 0 ? 'SETTLED' : 'PENDING'
				await tx.debt.update({
					where: { id: debt.id },
					data: { remaining: newRemaining, status }
				})

				localAmountLeft -= payAmount
			}
		})

		return true
	}
}
