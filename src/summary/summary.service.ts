/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { PrismaService } from '@/prisma/prisma.service'
import { Injectable } from '@nestjs/common'

// Інтерфейси для чіткої структури відповіді
export interface GroupBalance {
	groupInfo: {
		id: string
		name: string
		avatarUrl: string | null
	}
	balance: number
}

export interface UserBalance {
	user: {
		id: string
		displayName: string
		picture: string | null
		// Додайте інші поля користувача, які потрібні на фронтенді
		// name: string;
		// avatarUrl: string | null;
	}
	totalBalance: number
	groups: GroupBalance[]
}

@Injectable()
export class SummaryService {
	public constructor(private readonly prismaService: PrismaService) {}

	public async findDataForSummary(userId: string): Promise<UserBalance[]> {
		// 1. Отримуємо всі борги, пов'язані з користувачем
		const debts = await this.prismaService.debt.findMany({
			where: {
				// Користувач є або боржником, або кредитором
				OR: [{ debtorId: userId }, { creditorId: userId }],
				status: 'PENDING',
				isActual: true
			},
			include: {
				debtor: true,
				creditor: true,
				expense: {
					include: {
						group: true
					}
				}
			}
		})

		// 2. Отримуємо всі платежі, пов'язані з користувачем
		const payments = await this.prismaService.groupPayment.findMany({
			where: {
				OR: [{ fromId: userId }, { toId: userId }]
			},
			include: {
				from: true,
				to: true,
				group: true
			}
		})

		// 3. Агрегуємо дані, щоб розрахувати баланси
		const balancesByUser = new Map<
			string,
			{
				user: any
				totalBalance: number
				groups: Map<
					string,
					{
						groupInfo: any
						balance: number
					}
				>
			}
		>()

		// Обробляємо борги
		for (const debt of debts) {
			const isDebtor = debt.debtorId === userId
			const otherUser = isDebtor ? debt.creditor : debt.debtor

			if (!otherUser) continue

			// Якщо я боржник, мій баланс з іншим користувачем зменшується (негативний)
			// Якщо я кредитор, мій баланс збільшується (позитивний)
			const signedAmount = isDebtor ? -debt.remaining : debt.remaining

			const group = debt.expense.group

			// Ініціалізуємо запис для іншого користувача
			if (!balancesByUser.has(otherUser.id)) {
				balancesByUser.set(otherUser.id, {
					user: otherUser,
					totalBalance: 0,
					groups: new Map()
				})
			}

			const userBalance = balancesByUser.get(otherUser.id)!

			// Оновлюємо загальний баланс
			userBalance.totalBalance += signedAmount

			// Ініціалізуємо запис для групи
			if (!userBalance.groups.has(group.id)) {
				userBalance.groups.set(group.id, {
					groupInfo: {
						id: group.id,
						name: group.name,
						avatarUrl: group.avatarUrl
					},
					balance: 0
				})
			}

			const groupBalance = userBalance.groups.get(group.id)!
			groupBalance.balance += signedAmount
		}

		// Обробляємо платежі - віднімаємо їх від балансів
		for (const payment of payments) {
			const isFrom = payment.fromId === userId
			const otherUser = isFrom ? payment.to : payment.from

			if (!otherUser) continue

			// Якщо я заплатив (fromId), то мій баланс з іншим користувачем збільшується
			// Якщо мені заплатили (toId), то мій баланс зменшується
			const signedAmount = isFrom ? payment.amount : -payment.amount

			// Ініціалізуємо запис для іншого користувача, якщо потрібно
			if (!balancesByUser.has(otherUser.id)) {
				balancesByUser.set(otherUser.id, {
					user: otherUser,
					totalBalance: 0,
					groups: new Map()
				})
			}

			const userBalance = balancesByUser.get(otherUser.id)!
			userBalance.totalBalance += signedAmount

			// Оновлюємо баланс в групі
			if (!userBalance.groups.has(payment.groupId)) {
				userBalance.groups.set(payment.groupId, {
					groupInfo: {
						id: payment.group.id,
						name: payment.group.name,
						avatarUrl: payment.group.avatarUrl
					},
					balance: 0
				})
			}

			const groupBalance = userBalance.groups.get(payment.groupId)!
			groupBalance.balance += signedAmount
		}

		// 4. Форматуємо результат у зручний для фронтенду масив
		const result: UserBalance[] = Array.from(balancesByUser.values()).map(
			data => ({
				user: {
					id: data.user.id as string,
					displayName: data.user.displayName as string, // Додано це поле
					picture: data.user.picture as string // Додано це поле
				},
				totalBalance: data.totalBalance,
				groups: Array.from(data.groups.values())
			})
		)

		return result
	}

	public async settleUpBalances(
		userId: string,
		settlerUserId: string
	): Promise<boolean> {
		// Розраховуємо баланси між двома користувачами окремо для кожної спільної групи
		// Для кожної групи створюємо окремий платіж

		// 1. Отримуємо всі борги між цими користувачами
		const debts = await this.prismaService.debt.findMany({
			where: {
				OR: [
					{ debtorId: userId, creditorId: settlerUserId },
					{ debtorId: settlerUserId, creditorId: userId }
				],
				isActual: true
			},
			include: {
				expense: {
					select: { groupId: true }
				}
			}
		})

		// 2. Отримуємо всі платежі між цими користувачами
		const payments = await this.prismaService.groupPayment.findMany({
			where: {
				OR: [
					{ fromId: userId, toId: settlerUserId },
					{ fromId: settlerUserId, toId: userId }
				]
			}
		})

		// 3. Розраховуємо баланс для кожної групи окремо
		const balancesByGroup = new Map<string, number>()

		// Обробляємо борги
		for (const debt of debts) {
			const groupId = debt.expense.groupId
			const isUserDebtor = debt.debtorId === userId

			// Якщо userId боржник, його баланс негативний (винен)
			// Якщо userId кредитор, його баланс позитивний (йому винні)
			const signedAmount = isUserDebtor ? -debt.remaining : debt.remaining

			balancesByGroup.set(
				groupId,
				(balancesByGroup.get(groupId) || 0) + signedAmount
			)
		}

		// Обробляємо платежі
		for (const payment of payments) {
			const groupId = payment.groupId
			const isUserFrom = payment.fromId === userId

			// Якщо userId заплатив, його баланс збільшується (менше винен/більше має отримати)
			// Якщо userId отримав, його баланс зменшується (більше винен/менше має отримати)
			const signedAmount = isUserFrom ? payment.amount : -payment.amount

			balancesByGroup.set(
				groupId,
				(balancesByGroup.get(groupId) || 0) + signedAmount
			)
		}

		// 4. Створюємо платіж для кожної групи де є ненульовий баланс
		for (const [groupId, balance] of balancesByGroup.entries()) {
			if (Math.abs(balance) < 0.01) {
				// Баланс вже нульовий в цій групі
				continue
			}

			if (balance > 0) {
				// settlerUserId винен userId
				await this.prismaService.groupPayment.create({
					data: {
						groupId: groupId,
						fromId: settlerUserId,
						toId: userId,
						amount: balance,
						creatorId: userId
					}
				})
			} else {
				// userId винен settlerUserId
				await this.prismaService.groupPayment.create({
					data: {
						groupId: groupId,
						fromId: userId,
						toId: settlerUserId,
						amount: Math.abs(balance),
						creatorId: userId
					}
				})
			}
		}

		return true
	}
}
