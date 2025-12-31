import { Injectable, ForbiddenException } from '@nestjs/common'
import { PrismaService } from '@/prisma/prisma.service'
import { UserRole } from '@prisma/client'
import { I18nService, I18nContext } from 'nestjs-i18n'

@Injectable()
export class AdminService {
	public constructor(
		private readonly prismaService: PrismaService,
		private readonly i18n: I18nService
	) {}

	private async verifyAdmin(userId: string) {
		const user = await this.prismaService.user.findUnique({
			where: { id: userId },
			select: { role: true }
		})

		if (!user || user.role !== UserRole.ADMIN) {
			throw new ForbiddenException(
				this.i18n.t('common.errors.forbidden', {
					lang: I18nContext.current()?.lang
				})
			)
		}
	}

	public async getUsersCount(userId: string) {
		await this.verifyAdmin(userId)

		const thirtyDaysAgo = new Date()
		thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

		const [totalCount, activeCount] = await Promise.all([
			this.prismaService.user.count(),
			this.prismaService.user.count({
				where: {
					updatedAt: {
						gte: thirtyDaysAgo
					}
				}
			})
		])

		return {
			total: totalCount,
			active: activeCount
		}
	}

	public async getExpensesCount(userId: string) {
		await this.verifyAdmin(userId)

		const thirtyDaysAgo = new Date()
		thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

		const [totalCount, lastMonthCount] = await Promise.all([
			this.prismaService.expense.count({
				where: {
					description: {
						not: 'Simplified debts'
					}
				}
			}),
			this.prismaService.expense.count({
				where: {
					description: {
						not: 'Simplified debts'
					},
					createdAt: {
						gte: thirtyDaysAgo
					}
				}
			})
		])

		return {
			total: totalCount,
			lastMonth: lastMonthCount
		}
	}

	public async getGroupsCount(
		userId: string
	): Promise<{ total: number; finished: number; active: number }> {
		await this.verifyAdmin(userId)

		const [totalCount, finishedCount] = await Promise.all([
			this.prismaService.groupEntity.count(),
			this.prismaService.groupEntity.count({
				where: {
					isFinished: true
				}
			})
		])

		return {
			total: totalCount,
			finished: finishedCount,
			active: totalCount - finishedCount
		}
	}

	public async getExpenseTypeStatistics(userId: string) {
		await this.verifyAdmin(userId)

		const total = await this.prismaService.expense.count({
			where: {
				description: {
					not: 'Simplified debts'
				}
			}
		})

		if (total === 0) {
			return {
				total: 0,
				statistics: []
			}
		}

		const statistics = await this.prismaService.expense.groupBy({
			by: ['splitType'],
			where: {
				description: {
					not: 'Simplified debts'
				}
			},
			_count: {
				splitType: true
			}
		})

		const result = statistics.map(stat => ({
			type: stat.splitType,
			count: stat._count.splitType,
			percentage: ((stat._count.splitType / total) * 100).toFixed(2)
		}))

		return {
			total,
			statistics: result
		}
	}

	public async getDashboardStatistics(userId: string) {
		await this.verifyAdmin(userId)

		const thirtyDaysAgo = new Date()
		thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

		const [
			totalUsersCount,
			activeUsersCount,
			totalExpensesCount,
			lastMonthExpensesCount,
			totalGroupsCount,
			finishedGroupsCount
		] = await Promise.all([
			this.prismaService.user.count(),
			this.prismaService.user.count({
				where: {
					updatedAt: {
						gte: thirtyDaysAgo
					}
				}
			}),
			this.prismaService.expense.count({
				where: {
					description: {
						not: 'Simplified debts'
					}
				}
			}),
			this.prismaService.expense.count({
				where: {
					description: {
						not: 'Simplified debts'
					},
					createdAt: {
						gte: thirtyDaysAgo
					}
				}
			}),
			this.prismaService.groupEntity.count(),
			this.prismaService.groupEntity.count({
				where: {
					isFinished: true
				}
			})
		])

		const expenseTypeStats = await this.prismaService.expense.groupBy({
			by: ['splitType'],
			where: {
				description: {
					not: 'Simplified debts'
				}
			},
			_count: {
				splitType: true
			}
		})

		const expenseTypeStatistics = expenseTypeStats.map(stat => ({
			type: stat.splitType,
			count: stat._count.splitType,
			percentage:
				totalExpensesCount > 0
					? ((stat._count.splitType / totalExpensesCount) * 100).toFixed(
							2
					  )
					: '0.00'
		}))

		return {
			users: {
				total: totalUsersCount,
				active: activeUsersCount
			},
			expenses: {
				total: totalExpensesCount,
				lastMonth: lastMonthExpensesCount
			},
			groups: {
				total: totalGroupsCount,
				finished: finishedGroupsCount,
				active: totalGroupsCount - finishedGroupsCount
			},
			expenseTypeStatistics
		}
	}
}
