import { PrismaService } from '@/prisma/prisma.service'
import {
	Injectable,
	NotFoundException,
	BadRequestException
} from '@nestjs/common'
import { I18nService } from 'nestjs-i18n'
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
		private readonly notificationsService: NotificationsService,
		private readonly i18n: I18nService
	) {}

	async addDebtPay(dto: GroupDebtPaymentDto, userId: string) {
		const amountLeft = dto.amount
		if (amountLeft <= 0)
			throw new BadRequestException(
				this.i18n.t('debts.payment.amount_positive')
			)

		const isUserGroupMember =
			await this.groupMembersService.isUserGroupMember(
				userId,
				dto.groupId
			)

		if (!isUserGroupMember)
			throw new BadRequestException(
				this.i18n.t('debts.payment.not_group_member')
			)

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
			throw new NotFoundException(
				this.i18n.t('debts.payment.no_pending_debts')
			)

		const sumOfDebts = debts.reduce((sum, debt) => sum + debt.remaining, 0)
		if (sumOfDebts < amountLeft)
			throw new BadRequestException(
				this.i18n.t('debts.payment.amount_too_large')
			)

		await this.prismaService.$transaction(async tx => {
			let localAmountLeft = amountLeft
			const settledDebts: Array<{
				debt: (typeof debts)[number]
				expenseDescription: string
			}> = []

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

				// Якщо борг повністю вирішений, додаємо його до списку
				if (status === 'SETTLED') {
					const expense = await tx.expense.findFirst({
						where: { id: debt.expenseId },
						select: { description: true }
					})

					if (expense) {
						settledDebts.push({
							debt,
							expenseDescription: expense.description
						})
					}
				}

				localAmountLeft -= payAmount
			}

			// Створюємо згруповані нотифікації для погашених боргів
			if (settledDebts.length > 0) {
				await this.createSettledDebtsNotifications(
					settledDebts,
					dto.groupId,
					tx
				)
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

				// Створюємо згруповані нотифікації для всіх вирішених боргів
				const settledDebtsData = allDebts
					.filter(debt => debt.expense)
					.map(debt => ({
						debt,
						expenseDescription: debt.expense!.description
					}))

				if (settledDebtsData.length > 0) {
					await this.createSettledDebtsNotifications(
						settledDebtsData,
						dto.groupId,
						tx
					)
				}
			}
		})

		return true
	}

	async deleteDebtPay(dto: DeleteGroupDebtPaymentDto, userId: string) {
		// Валідація DTO
		if (!dto.groupId || !dto.creditorId || !dto.debtorId) {
			throw new BadRequestException(
				this.i18n.t('debts.payment.required_fields_missing')
			)
		}

		const isUserGroupMember =
			await this.groupMembersService.isUserGroupMember(
				userId,
				dto.groupId
			)

		if (!isUserGroupMember)
			throw new BadRequestException(
				this.i18n.t('debts.payment.not_group_member')
			)

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
				this.i18n.t('debts.payment.no_debts_found')
			)

		// Перевіряємо чи є платежі для видалення
		const hasPayments = debts.some(debt => debt.payments.length > 0)
		if (!hasPayments)
			throw new NotFoundException(
				this.i18n.t('debts.payment.no_payments_found')
			)

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
							title: this.i18n.t(
								'debts.notifications.debt_reactivated.title'
							),
							message: this.i18n.t(
								'debts.notifications.debt_reactivated.message_debtor',
								{
									args: {
										expenseDescription: expense.description
									}
								}
							),
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
							title: this.i18n.t(
								'debts.notifications.debt_reactivated.title'
							),
							message: this.i18n.t(
								'debts.notifications.debt_reactivated.message_creditor',
								{
									args: {
										expenseDescription: expense.description
									}
								}
							),
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

	private async createSettledDebtsNotifications(
		settledDebts: Array<{
			debt: {
				id: string
				debtorId: string
				creditorId: string
				amount: number
			}
			expenseDescription: string
		}>,
		groupId: string,
		tx: any
	): Promise<void> {
		// Групуємо борги по боржниках та кредиторах
		const debtorNotifications = new Map<
			string,
			{ totalAmount: number; count: number }
		>()
		const creditorNotifications = new Map<
			string,
			{ totalAmount: number; count: number }
		>()

		for (const { debt } of settledDebts) {
			// Для боржників
			const debtorData = debtorNotifications.get(debt.debtorId) || {
				totalAmount: 0,
				count: 0
			}
			debtorData.totalAmount += debt.amount
			debtorData.count += 1
			debtorNotifications.set(debt.debtorId, debtorData)

			// Для кредиторів
			const creditorData = creditorNotifications.get(debt.creditorId) || {
				totalAmount: 0,
				count: 0
			}
			creditorData.totalAmount += debt.amount
			creditorData.count += 1
			creditorNotifications.set(debt.creditorId, creditorData)
		}

		// Створюємо одне сповіщення для кожного боржника
		for (const [debtorId, data] of debtorNotifications.entries()) {
			await this.notificationsService.create({
				userId: debtorId,
				type: 'DEBT_SETTLED',
				title: this.i18n.t('debts.notifications.debt_settled.title'),
				message: this.i18n.t(
					'debts.notifications.debt_settled.message_debtor_multiple',
					{
						args: {
							count: data.count,
							totalAmount: data.totalAmount
						}
					}
				),
				relatedGroupId: groupId,
				metadata: {
					totalAmount: data.totalAmount,
					count: data.count,
					isDebtor: true
				}
			})
		}

		// Створюємо одне сповіщення для кожного кредитора
		for (const [creditorId, data] of creditorNotifications.entries()) {
			await this.notificationsService.create({
				userId: creditorId,
				type: 'DEBT_SETTLED',
				title: this.i18n.t('debts.notifications.debt_settled.title'),
				message: this.i18n.t(
					'debts.notifications.debt_settled.message_creditor_multiple',
					{
						args: {
							count: data.count,
							totalAmount: data.totalAmount
						}
					}
				),
				relatedGroupId: groupId,
				metadata: {
					totalAmount: data.totalAmount,
					count: data.count,
					isDebtor: false
				}
			})
		}
	}
}
