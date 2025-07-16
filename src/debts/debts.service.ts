import { PrismaService } from '@/prisma/prisma.service'
import {
	Injectable,
	NotFoundException,
	BadRequestException
} from '@nestjs/common'
import { GroupDebtPaymentDto } from './dto/group-debt-payment.dto'
import { DebtStatus } from '@prisma/client'

@Injectable()
export class DebtsService {
	public constructor(private readonly prismaService: PrismaService) {}

	async addDebtPay(dto: GroupDebtPaymentDto, userId: string) {
		let amountLeft = dto.amount
		if (amountLeft <= 0)
			throw new BadRequestException('Amount must be positive')

		// Знаходимо всі борги користувача в групі зі статусом PENDING
		const debts = await this.prismaService.debt.findMany({
			where: {
				debtorId: userId, // ви — боржник
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

		const payments: {
			debtId: string
			payAmount: number
			status: string
			newRemaining: number
		}[] = []

		for (const debt of debts) {
			if (amountLeft <= 0) break
			const payAmount = Math.min(debt.remaining, amountLeft)

			// Створити платіж
			await this.prismaService.debtPayment.create({
				data: { debtId: debt.id, amount: payAmount }
			})

			// Оновити борг
			const newRemaining = debt.remaining - payAmount
			const status = newRemaining <= 0 ? 'SETTLED' : 'PENDING'
			await this.prismaService.debt.update({
				where: { id: debt.id },
				data: { remaining: newRemaining, status }
			})

			payments.push({ debtId: debt.id, payAmount, status, newRemaining })
			amountLeft -= payAmount
		}

		// Після циклу — знайти залишок по всіх боргах користувача перед цим кредитором у цій групі
		const pendingDebts = await this.prismaService.debt.findMany({
			where: {
				debtorId: userId,
				creditorId: dto.creditorId,
				status: 'PENDING',
				expense: { groupId: dto.groupId }
			}
		})
		const totalDebtLeft = pendingDebts.reduce(
			(sum, d) => sum + d.remaining,
			0
		)

		return { payments, totalDebtLeft }
	}
}
