import { PrismaService } from '@/prisma/prisma.service'
import {
	Injectable,
	NotFoundException,
	BadRequestException
} from '@nestjs/common'
import {
	GroupDebtPaymentDto,
	DeleteGroupDebtPaymentDto
} from './dto/group-debt-payment.dto'
import { DebtStatus } from '@prisma/client'
import { GroupMembersService } from '@/group-members/group-members.service'
import { NotificationsService } from '@/notifications/notifications.service'

@Injectable()
export class DebtsService {
	public constructor(
		private readonly prismaService: PrismaService,
		private readonly groupMembersService: GroupMembersService,
		private readonly notificationsService: NotificationsService
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
					data: {
						debtId: debt.id,
						amount: payAmount,
						creatorId: userId
					}
				})

				// Оновити борг
				const newRemaining = debt.remaining - payAmount
				const status = newRemaining <= 0 ? 'SETTLED' : 'PENDING'
				await tx.debt.update({
					where: { id: debt.id },
					data: { remaining: newRemaining, status }
				})

				// Створюємо нотифікацію, якщо борг повністю вирішений
				if (status === 'SETTLED') {
					// Отримуємо деталі витрати для нотифікації
					const expense = await tx.expense.findFirst({
						where: { id: debt.expenseId },
						select: { description: true }
					})

					if (expense) {
						// Нотифікація для боржника
						await this.notificationsService.create({
							userId: debt.debtorId,
							type: 'DEBT_SETTLED',
							title: 'Debt settled',
							message: `Your debt for "${expense.description}" has been settled`,
							relatedDebtId: debt.id,
							relatedGroupId: dto.groupId,
							metadata: {
								expenseDescription: expense.description,
								amount: debt.amount,
								isDebtor: true
							}
						})

						// Нотифікація для кредитора
						await this.notificationsService.create({
							userId: debt.creditorId,
							type: 'DEBT_SETTLED',
							title: 'Debt settled',
							message: `Debt for "${expense.description}" has been settled`,
							relatedDebtId: debt.id,
							relatedGroupId: dto.groupId,
							metadata: {
								expenseDescription: expense.description,
								amount: debt.amount,
								isDebtor: false
							}
						})
					}
				}

				localAmountLeft -= payAmount
			}

			const [directDebts, reverseDebts] = await Promise.all([
				tx.debt.findMany({
					where: {
						debtorId: dto.debtorId,
						creditorId: dto.creditorId,
						status: DebtStatus.PENDING,
						expense: { groupId: dto.groupId }
					}
				}),
				tx.debt.findMany({
					where: {
						debtorId: dto.creditorId,
						creditorId: dto.debtorId,
						status: DebtStatus.PENDING,
						expense: { groupId: dto.groupId }
					}
				})
			])

			const directSum = directDebts.reduce(
				(sum, d) => sum + d.remaining,
				0
			)
			const reverseSum = reverseDebts.reduce(
				(sum, d) => sum + d.remaining,
				0
			)

			if (Math.abs(directSum - reverseSum) < 0.01 && directSum > 0) {
				// Отримуємо деталі боргів для створення нотифікацій
				const allDebts = await tx.debt.findMany({
					where: {
						OR: [
							{
								debtorId: dto.debtorId,
								creditorId: dto.creditorId,
								status: DebtStatus.PENDING,
								expense: { groupId: dto.groupId }
							},
							{
								debtorId: dto.creditorId,
								creditorId: dto.debtorId,
								status: DebtStatus.PENDING,
								expense: { groupId: dto.groupId }
							}
						]
					},
					include: {
						expense: {
							select: { description: true }
						}
					}
				})

				// Оновлюємо статус боргів
				await tx.debt.updateMany({
					where: {
						OR: [
							{
								debtorId: dto.debtorId,
								creditorId: dto.creditorId,
								status: DebtStatus.PENDING,
								expense: { groupId: dto.groupId }
							},
							{
								debtorId: dto.creditorId,
								creditorId: dto.debtorId,
								status: DebtStatus.PENDING,
								expense: { groupId: dto.groupId }
							}
						]
					},
					data: { remaining: 0, status: DebtStatus.SETTLED }
				})

				// Створюємо нотифікації для всіх вирішених боргів
				for (const debt of allDebts) {
					if (debt.expense) {
						// Нотифікація для боржника
						await this.notificationsService.create({
							userId: debt.debtorId,
							type: 'DEBT_SETTLED',
							title: 'Debt settled',
							message: `Your debt for "${debt.expense.description}" has been settled`,
							relatedDebtId: debt.id,
							relatedGroupId: dto.groupId,
							metadata: {
								expenseDescription: debt.expense.description,
								amount: debt.amount,
								isDebtor: true
							}
						})

						// Нотифікація для кредитора
						await this.notificationsService.create({
							userId: debt.creditorId,
							type: 'DEBT_SETTLED',
							title: 'Debt settled',
							message: `Debt for "${debt.expense.description}" has been settled`,
							relatedDebtId: debt.id,
							relatedGroupId: dto.groupId,
							metadata: {
								expenseDescription: debt.expense.description,
								amount: debt.amount,
								isDebtor: false
							}
						})
					}
				}
			}
		})

		return true
	}

	async deleteDebtPay(dto: DeleteGroupDebtPaymentDto, userId: string) {
		// Валідація DTO
		if (!dto.groupId || !dto.creditorId || !dto.debtorId) {
			throw new BadRequestException(
				'Required fields for deleting debt payment are missing'
			)
		}

		const isUserGroupMember =
			await this.groupMembersService.isUserGroupMember(
				userId,
				dto.groupId
			)

		if (!isUserGroupMember)
			throw new BadRequestException('You are not a member of this group')

		// Знаходимо всі борги між цими користувачами в групі
		const debts = await this.prismaService.debt.findMany({
			where: {
				OR: [
					{
						debtorId: dto.debtorId,
						creditorId: dto.creditorId,
						expense: { groupId: dto.groupId }
					},
					{
						debtorId: dto.creditorId,
						creditorId: dto.debtorId,
						expense: { groupId: dto.groupId }
					}
				]
			},
			include: {
				payments: {
					where: { isActual: true },
					orderBy: { createdAt: 'desc' }
				}
			}
		})

		if (!debts.length)
			throw new NotFoundException(
				'No debts found between these users in this group'
			)

		// Перевіряємо чи є платежі для видалення
		const hasPayments = debts.some(debt => debt.payments.length > 0)
		if (!hasPayments)
			throw new NotFoundException('No payments found to delete')

		await this.prismaService.$transaction(async tx => {
			for (const debt of debts) {
				if (debt.payments.length === 0) continue

				// Видаляємо всі платежі по цьому боргу
				await tx.debtPayment.deleteMany({
					where: { debtId: debt.id }
				})

				// Відновлюємо початковий стан боргу
				const totalPaid = debt.payments.reduce(
					(sum, payment) => sum + payment.amount,
					0
				)
				const newRemaining = debt.remaining + totalPaid

				await tx.debt.update({
					where: { id: debt.id },
					data: {
						remaining: newRemaining,
						status:
							newRemaining <= 0
								? DebtStatus.SETTLED
								: DebtStatus.PENDING
					}
				})

				// Якщо борг знову став активним (PENDING), створюємо нотифікацію
				if (newRemaining > 0) {
					// Отримуємо деталі витрати для нотифікації
					const expense = await tx.expense.findFirst({
						where: { id: debt.expenseId },
						select: { description: true }
					})

					if (expense) {
						// Нотифікація для боржника
						await this.notificationsService.create({
							userId: debt.debtorId,
							type: 'DEBT_CREATED',
							title: 'Debt reactivated',
							message: `Your debt for "${expense.description}" has been reactivated`,
							relatedDebtId: debt.id,
							relatedExpenseId: debt.expenseId,
							metadata: {
								expenseDescription: expense.description,
								amount: newRemaining,
								isDebtor: true
							}
						})

						// Нотифікація для кредитора
						await this.notificationsService.create({
							userId: debt.creditorId,
							type: 'DEBT_CREATED',
							title: 'Debt reactivated',
							message: `Debt for "${expense.description}" has been reactivated`,
							relatedDebtId: debt.id,
							relatedExpenseId: debt.expenseId,
							metadata: {
								expenseDescription: expense.description,
								amount: newRemaining,
								isDebtor: false
							}
						})
					}
				}
			}
		})

		return true
	}
}
