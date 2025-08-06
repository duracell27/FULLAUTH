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
				// Можливо, ви захочете виключити врегульовані борги,
				// але для загального балансу краще враховувати всю історію.
				status: 'PENDING',
				isActual: true
			},
			include: {
				debtor: true, // Інформація про боржника
				creditor: true, // Інформація про кредитора
				expense: {
					include: {
						group: true // Інформація про групу, до якої належить витрата
					}
				}
			}
		})

		// 2. Агрегуємо дані, щоб розрахувати баланси
		const balancesByUser = new Map<
			string,
			{
				user: any // Замініть `any` на тип вашої моделі User
				totalBalance: number
				groups: Map<
					string,
					{
						groupInfo: any // Замініть `any` на тип GroupEntity
						balance: number
					}
				>
			}
		>()

		for (const debt of debts) {
			// Визначаємо, хто в цій транзакції "інший" користувач
			const isDebtor = debt.debtorId === userId
			const otherUser = isDebtor ? debt.creditor : debt.debtor

			if (!otherUser) continue // Пропускаємо, якщо дані неповні

			// Розраховуємо суму для балансу.
			// Якщо я боржник (isDebtor), мій баланс з іншим користувачем зменшується (стає негативним).
			// Якщо я кредитор, мій баланс збільшується (стає позитивним).
			const signedAmount = isDebtor ? -debt.remaining : debt.remaining

			const group = debt.expense.group

			// Ініціалізуємо запис для іншого користувача, якщо його ще немає
			if (!balancesByUser.has(otherUser.id)) {
				balancesByUser.set(otherUser.id, {
					user: otherUser,
					totalBalance: 0,
					groups: new Map()
				})
			}

			const userBalance = balancesByUser.get(otherUser.id)!

			// Оновлюємо загальний баланс з цим користувачем
			userBalance.totalBalance += signedAmount

			// Ініціалізуємо запис для групи, якщо його ще немає
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

			// Оновлюємо баланс у контексті конкретної групи
			groupBalance.balance += signedAmount
		}

		// 3. Форматуємо результат у зручний для фронтенду масив
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
		await this.prismaService.$transaction(async tx => {
			// Знаходимо всі борги між цими двома користувачами
			const debts = await tx.debt.findMany({
				where: {
					status: 'PENDING',
					isActual: true,
					OR: [
						{ debtorId: userId, creditorId: settlerUserId },
						{ debtorId: settlerUserId, creditorId: userId }
					]
				}
			})

			for (const debt of debts) {
				if (debt.remaining > 0) {
					await tx.debtPayment.create({
						data: {
							debtId: debt.id,
							amount: debt.remaining,
							creatorId: userId
						}
					})
				}
				await tx.debt.update({
					where: { id: debt.id },
					data: {
						status: 'SETTLED',
						remaining: 0
					}
				})
			}
		})
		return true
	}
}
