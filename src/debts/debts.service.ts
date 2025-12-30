import { PrismaService } from '@/prisma/prisma.service'
import {
	Injectable,
	NotFoundException,
	BadRequestException,
	Inject,
	forwardRef
} from '@nestjs/common'
import { I18nService, I18nContext } from 'nestjs-i18n'
import {
	GroupDebtPaymentDto,
	DeleteGroupDebtPaymentDto
} from './dto/group-debt-payment.dto'
import { GroupMembersService } from '@/group-members/group-members.service'
import { NotificationsService } from '@/notifications/notifications.service'
import { GroupsService } from '@/groups/groups.service'

@Injectable()
export class DebtsService {
	public constructor(
		private readonly prismaService: PrismaService,
		private readonly groupMembersService: GroupMembersService,
		private readonly notificationsService: NotificationsService,
		private readonly i18n: I18nService,
		@Inject(forwardRef(() => GroupsService))
		private readonly groupsService: GroupsService
	) {}

	async addDebtPay(dto: GroupDebtPaymentDto, userId: string) {
		const paymentAmount = dto.amount
		if (paymentAmount <= 0)
			throw new BadRequestException(
				this.i18n.t('common.debts.payment.amount_positive', {
					lang: I18nContext.current()?.lang
				})
			)

		// Перевіряємо, чи група не завершена
		const groupCheck = await this.prismaService.groupEntity.findUnique({
			where: { id: dto.groupId },
			select: { isFinished: true }
		})

		if (!groupCheck) {
			throw new NotFoundException(
				this.i18n.t('common.groups.errors.group_not_found', {
					lang: I18nContext.current()?.lang
				})
			)
		}

		if (groupCheck.isFinished) {
			throw new BadRequestException(
				this.i18n.t('common.debts.payment.group_is_finished', {
					lang: I18nContext.current()?.lang
				})
			)
		}

		const isUserGroupMember =
			await this.groupMembersService.isUserGroupMember(
				userId,
				dto.groupId
			)

		if (!isUserGroupMember)
			throw new BadRequestException(
				this.i18n.t('common.debts.payment.not_group_member', {
					lang: I18nContext.current()?.lang
				})
			)

		// Розраховуємо поточний баланс між двома користувачами
		// Balance = (борги debtorId → creditorId) - (борги creditorId → debtorId) - (платежі debtorId → creditorId) + (платежі creditorId → debtorId)
		const [debtsOwed, debtsOwedReverse, paymentsFrom, paymentsTo] =
			await Promise.all([
				// Борги: debtorId винен creditorId
				this.prismaService.debt.aggregate({
					where: {
						debtorId: dto.debtorId,
						creditorId: dto.creditorId,
						isActual: true,
						expense: { groupId: dto.groupId }
					},
					_sum: { remaining: true }
				}),
				// Борги: creditorId винен debtorId (зворотній напрямок)
				this.prismaService.debt.aggregate({
					where: {
						debtorId: dto.creditorId,
						creditorId: dto.debtorId,
						isActual: true,
						expense: { groupId: dto.groupId }
					},
					_sum: { remaining: true }
				}),
				// Платежі: debtorId → creditorId
				this.prismaService.groupPayment.aggregate({
					where: {
						groupId: dto.groupId,
						fromId: dto.debtorId,
						toId: dto.creditorId
					},
					_sum: { amount: true }
				}),
				// Платежі: creditorId → debtorId
				this.prismaService.groupPayment.aggregate({
					where: {
						groupId: dto.groupId,
						fromId: dto.creditorId,
						toId: dto.debtorId
					},
					_sum: { amount: true }
				})
			])

		const debtsOwedSum = debtsOwed._sum.remaining || 0
		const debtsOwedReverseSum = debtsOwedReverse._sum.remaining || 0
		const paymentsFromSum = paymentsFrom._sum.amount || 0
		const paymentsToSum = paymentsTo._sum.amount || 0

		// Поточний баланс (скільки debtorId ще винен creditorId)
		const currentBalance =
			debtsOwedSum - debtsOwedReverseSum - paymentsFromSum + paymentsToSum

		if (currentBalance < paymentAmount - 0.01)
			throw new BadRequestException(
				this.i18n.t('common.debts.payment.amount_too_large', {
					lang: I18nContext.current()?.lang
				})
			)

		if (currentBalance <= 0.01)
			throw new NotFoundException(
				this.i18n.t('common.debts.payment.no_pending_debts', {
					lang: I18nContext.current()?.lang
				})
			)

		// Створюємо платіж
		await this.prismaService.groupPayment.create({
			data: {
				groupId: dto.groupId,
				fromId: dto.debtorId,
				toId: dto.creditorId,
				amount: paymentAmount,
				creatorId: userId
			}
		})

		// Перераховуємо спрощені борги з урахуванням нового платежу
		const group = await this.prismaService.groupEntity.findUnique({
			where: { id: dto.groupId },
			select: {
				simplificationExpenseId: true
			}
		})

		if (group?.simplificationExpenseId) {
			await this.groupsService.simplifyAllDebts(
				dto.groupId,
				group.simplificationExpenseId
			)
		}

		// Перевіряємо чи після платежу баланс став близьким до нуля
		const newBalance = currentBalance - paymentAmount
		if (Math.abs(newBalance) < 0.01) {
			// Баланс вирівнявся! Створюємо нотифікації про погашення боргів
			const allDebts = await this.prismaService.debt.findMany({
				where: {
					OR: [
						{
							debtorId: dto.debtorId,
							creditorId: dto.creditorId,
							isActual: true,
							expense: { groupId: dto.groupId }
						},
						{
							debtorId: dto.creditorId,
							creditorId: dto.debtorId,
							isActual: true,
							expense: { groupId: dto.groupId }
						}
					],
					remaining: { gt: 0 }
				},
				include: {
					expense: {
						select: { description: true }
					}
				}
			})

			if (allDebts.length > 0) {
				const settledDebtsData = allDebts
					.filter(debt => debt.expense)
					.map(debt => ({
						debt,
						expenseDescription: debt.expense.description
					}))

				await this.createSettledDebtsNotifications(
					settledDebtsData,
					dto.groupId
				)
			}
		}

		return true
	}

	async deleteDebtPay(dto: DeleteGroupDebtPaymentDto, userId: string) {
		// Валідація DTO
		if (!dto.paymentId) {
			throw new BadRequestException(
				this.i18n.t('common.debts.payment.required_fields_missing', {
					lang: I18nContext.current()?.lang
				})
			)
		}

		// Знаходимо конкретний платіж по ID
		const payment = await this.prismaService.groupPayment.findUnique({
			where: {
				id: dto.paymentId
			},
			select: {
				id: true,
				groupId: true,
				fromId: true,
				toId: true,
				creatorId: true
			}
		})

		if (!payment)
			throw new NotFoundException(
				this.i18n.t('common.debts.payment.no_payments_found', {
					lang: I18nContext.current()?.lang
				})
			)

		// Перевіряємо, чи група не завершена
		const groupCheck = await this.prismaService.groupEntity.findUnique({
			where: { id: payment.groupId },
			select: { isFinished: true }
		})

		if (!groupCheck) {
			throw new NotFoundException(
				this.i18n.t('common.groups.errors.group_not_found', {
					lang: I18nContext.current()?.lang
				})
			)
		}

		if (groupCheck.isFinished) {
			throw new BadRequestException(
				this.i18n.t('common.debts.payment.group_is_finished', {
					lang: I18nContext.current()?.lang
				})
			)
		}

		// Перевіряємо чи користувач є учасником групи
		const isUserGroupMember =
			await this.groupMembersService.isUserGroupMember(
				userId,
				payment.groupId
			)

		if (!isUserGroupMember)
			throw new BadRequestException(
				this.i18n.t('common.debts.payment.not_group_member', {
					lang: I18nContext.current()?.lang
				})
			)

		// Видаляємо конкретний платіж
		await this.prismaService.groupPayment.delete({
			where: {
				id: dto.paymentId
			}
		})

		// Перераховуємо спрощені борги після видалення платежу
		const group = await this.prismaService.groupEntity.findUnique({
			where: { id: payment.groupId },
			select: {
				simplificationExpenseId: true
			}
		})

		if (group?.simplificationExpenseId) {
			await this.groupsService.simplifyAllDebts(
				payment.groupId,
				group.simplificationExpenseId
			)
		}

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
		groupId: string
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
				title: this.i18n.t(
					'common.debts.notifications.debt_settled.title',
					{
						lang: I18nContext.current()?.lang
					}
				),
				message: this.i18n.t(
					'debts.notifications.debt_settled.message_debtor_multiple',
					{
						lang: I18nContext.current()?.lang,
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
				title: this.i18n.t(
					'common.debts.notifications.debt_settled.title',
					{
						lang: I18nContext.current()?.lang
					}
				),
				message: this.i18n.t(
					'debts.notifications.debt_settled.message_creditor_multiple',
					{
						lang: I18nContext.current()?.lang,
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
