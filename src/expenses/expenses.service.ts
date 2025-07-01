import { PrismaService } from '@/prisma/prisma.service'
import {
	BadRequestException,
	Injectable,
	NotFoundException
} from '@nestjs/common'
import { CreateExpenseDto } from './dto/CreateExpense.dto'
import { Prisma, SplitType } from '@prisma/client'

// Визначаємо тип, який буде повертатися
// Він має ТОЧНО відповідати запиту в `findUnique` (включаючи `include`)
type ExpenseWithDetails = Prisma.ExpenseGetPayload<{
	include: {
		payers: true
		splits: true
	}
}>

@Injectable()
export class ExpensesService {
	public constructor(private readonly prismaService: PrismaService) {}

	async addExpense(
		dto: CreateExpenseDto,
		creatorId: string
	): Promise<ExpenseWithDetails | null> {
		// --- Попередня валідація логіки ---
		const totalPaid = dto.payers.reduce((sum, p) => sum + p.amount, 0)
		if (Math.abs(totalPaid - dto.amount) > 0.01) {
			throw new BadRequestException(
				'Сума платежів не збігається із загальною сумою витрати.'
			)
		}

		// Перевірка, чи всі потрібні юзери і група існують (можна додати для надійності)

		// --- Основна логіка в транзакції ---
		return this.prismaService.$transaction(async tx => {
			// 1. Створюємо саму витрату
			const expense = await tx.expense.create({
				data: {
					description: dto.description,
					amount: dto.amount,
					splitType: dto.splitType,
					photoUrl: dto.photoUrl,
					groupId: dto.groupId,
					date: dto.date,
					creatorId: creatorId
				}
			})

			// 2. Створюємо записи про те, хто платив (ExpensePayment)
			await tx.expensePayment.createMany({
				data: dto.payers.map(payer => ({
					expenseId: expense.id,
					payerId: payer.userId,
					amount: payer.amount
				}))
			})

			// 3. Розраховуємо, хто кому і скільки винен (це найскладніша частина)
			// Створюємо мапу балансів для всіх учасників
			const userBalances = new Map<string, number>()

			// Додаємо гроші на баланс тим, хто платив (вони "кредитори")
			for (const payer of dto.payers) {
				userBalances.set(
					payer.userId,
					(userBalances.get(payer.userId) || 0) + payer.amount
				)
			}

			// Розраховуємо частку боргу для кожного
			const debtorShares = this.calculateDebtorShares(dto)

			// Віднімаємо борги з балансів (вони "боржники")
			for (const [userId, share] of debtorShares.entries()) {
				userBalances.set(
					userId,
					(userBalances.get(userId) || 0) - share
				)
			}

			// 4. Генеруємо фінальні записи боргів (Debt)
			// Розділяємо користувачів на тих, хто винен (негативний баланс) і кому винні (позитивний баланс)
			const debtors: { userId: string; amount: number }[] = []
			const creditors: { userId: string; amount: number }[] = []

			for (const [userId, balance] of userBalances.entries()) {
				if (balance < -0.01) {
					// Боржники
					debtors.push({ userId, amount: -balance })
				} else if (balance > 0.01) {
					// Кредитори
					creditors.push({ userId, amount: balance })
				}
			}

			// Спрощуємо борги: кожен боржник віддає гроші кредиторам
			const debtsToCreate: Prisma.DebtCreateManyInput[] = []

			for (const debtor of debtors) {
				let debtAmountLeft = debtor.amount
				// Знаходимо оригінальні дані боржника з DTO для збереження
				const originalDebtorData = dto.debtors.find(
					d => d.userId === debtor.userId
				)

				for (const creditor of creditors) {
					if (creditor.amount <= 0 || debtAmountLeft <= 0) continue

					const paymentAmount = Math.min(
						debtAmountLeft,
						creditor.amount
					)

					debtsToCreate.push({
						expenseId: expense.id,
						debtorId: debtor.userId,
						creditorId: creditor.userId,
						amount: paymentAmount,
						remaining: paymentAmount, // Початково залишок дорівнює повній сумі
						// Зберігаємо параметри розрахунку для історії
						percentage: originalDebtorData?.percentage,
						shares: originalDebtorData?.shares
					})

					debtAmountLeft -= paymentAmount
					creditor.amount -= paymentAmount
				}
			}

			if (debtsToCreate.length > 0) {
				await tx.debt.createMany({
					data: debtsToCreate
				})
			}

			// Повертаємо створену витрату з усіма зв'язками
			return tx.expense.findUnique({
				where: { id: expense.id },
				include: {
					payers: true,
					splits: true
				}
			})
		})
	}

	private calculateDebtorShares(dto: CreateExpenseDto): Map<string, number> {
		const shares = new Map<string, number>()
		const numDebtors = dto.debtors.length

		// Перевірка, чи є взагалі боржники
		if (numDebtors === 0) {
			throw new BadRequestException(
				'Для поділу витрати необхідно вказати хоча б одного боржника.'
			)
		}

		switch (dto.splitType) {
			case SplitType.EQUAL: {
				// Рівномірний поділ загальної суми на всіх учасників.
				const equalShare = dto.amount / numDebtors
				dto.debtors.forEach(d => shares.set(d.userId, equalShare))
				break
			}

			case SplitType.PERCENTAGE: {
				// Поділ на основі відсотків.
				const totalPercentage = dto.debtors.reduce(
					(sum, d) => sum + (d.percentage || 0),
					0
				)
				if (Math.abs(totalPercentage - 100) > 0.1) {
					throw new BadRequestException(
						'Сума відсотків для поділу має дорівнювати 100.'
					)
				}
				dto.debtors.forEach(d => {
					const share = dto.amount * ((d.percentage || 0) / 100)
					shares.set(d.userId, share)
				})
				break
			}

			case SplitType.CUSTOM: {
				// Поділ на основі конкретних вказаних сум.
				const totalCustomSum = dto.debtors.reduce(
					(sum, d) => sum + (d.amount || 0),
					0
				)
				if (Math.abs(totalCustomSum - dto.amount) > 0.01) {
					throw new BadRequestException(
						'Сума кастомних боргів не збігається із загальною сумою витрати.'
					)
				}
				dto.debtors.forEach(d => shares.set(d.userId, d.amount || 0))
				break
			}

			case SplitType.SHARES: {
				// Поділ на основі часток (shares).
				const totalShares = dto.debtors.reduce(
					(sum, d) => sum + (d.shares || 0),
					0
				)
				if (totalShares <= 0) {
					throw new BadRequestException(
						'Загальна кількість часток для поділу має бути більшою за нуль.'
					)
				}

				const costPerShare = dto.amount / totalShares
				dto.debtors.forEach(d => {
					const userShareAmount = costPerShare * (d.shares || 0)
					shares.set(d.userId, userShareAmount)
				})
				break
			}

			case SplitType.EXTRA: {
				// Поділ, де деякі учасники платять екстра суму, а решта ділиться порівну.
				// У вашому DTO для DebtorDto має бути поле `extraAmount?: number`.
				const totalExtraAmount = dto.debtors.reduce(
					(sum, d) => sum + (d.extraAmount || 0),
					0
				)

				if (totalExtraAmount > dto.amount) {
					throw new BadRequestException(
						'Сума екстра платежів не може перевищувати загальну суму витрати.'
					)
				}

				const remainingAmount = dto.amount - totalExtraAmount
				const equalPartOfRemaining = remainingAmount / numDebtors

				dto.debtors.forEach(d => {
					const userExtraAmount = d.extraAmount || 0
					const finalUserDebt = equalPartOfRemaining + userExtraAmount
					shares.set(d.userId, finalUserDebt)
				})
				break
			}

			default:
				// Обробка невідомого або непідтримуваного типу поділу.
				throw new BadRequestException(
					`Непідтримуваний тип поділу витрати.`
				)
		}

		// Фінальна перевірка, що загальна сума боргів збігається з сумою витрати
		const calculatedTotal = Array.from(shares.values()).reduce(
			(sum, val) => sum + val,
			0
		)
		if (Math.abs(calculatedTotal - dto.amount) > 0.01) {
			// Ця помилка може виникнути через проблеми з округленням, вона важлива для цілісності даних
			throw new BadRequestException(
				`Кінцева розрахована сума боргів (${calculatedTotal.toFixed(2)}) не збігається із загальною сумою витрати (${dto.amount.toFixed(2)}).`
			)
		}

		return shares
	}

	public async getExpenseInfo(expenseId: string, userId: string) {
		// Крок 1: Робимо один запит, який одразу і знаходить витрату, і перевіряє доступ
		const expense = await this.prismaService.expense.findFirst({
			where: {
				id: expenseId,
				// Перевіряємо, чи існує в групі учасник з таким userId
				group: {
					members: {
						some: {
							userId: userId
						}
					}
				}
			},
			include: {
				// Включаємо дані про творця і вибираємо лише потрібні поля
				creator: {
					select: {
						id: true,
						displayName: true,
						picture: true
					}
				},
				// Включаємо платників
				payers: {
					include: {
						// Для кожного платника включаємо дані користувача
						payer: {
							select: {
								id: true,
								displayName: true,
								picture: true
							}
						}
					}
				},
				// Включаємо борги (хто скільки винен)
				splits: {
					include: {
						// Для кожного боржника включаємо дані користувача
						debtor: {
							select: {
								id: true,
								displayName: true,
								picture: true
							}
						}
					}
				}
			}
		})

		// Крок 2: Якщо витрата не знайдена або у користувача немає доступу, кидаємо помилку
		if (!expense) {
			throw new NotFoundException(
				'Expense not found or you do not have permission to view it.'
			)
		}

		return expense
	}
}
