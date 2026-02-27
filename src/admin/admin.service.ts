import {
	Injectable,
	ForbiddenException,
	NotFoundException,
	BadRequestException
} from '@nestjs/common'
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

	public async getUserStats(adminId: string, targetId: string) {
		await this.verifyAdmin(adminId)

		const user = await this.prismaService.user.findUnique({
			where: { id: targetId }
		})

		if (!user) {
			throw new NotFoundException('User not found')
		}

		const [
			groupsCount,
			expensesCreatedCount,
			expensesPayerCount,
			debtsCount,
			paymentsCount
		] = await Promise.all([
			this.prismaService.groupMember.count({
				where: { userId: targetId }
			}),
			this.prismaService.expense.count({
				where: { creatorId: targetId }
			}),
			this.prismaService.expensePayment.count({
				where: { payerId: targetId }
			}),
			this.prismaService.debt.count({
				where: {
					OR: [{ debtorId: targetId }, { creditorId: targetId }]
				}
			}),
			this.prismaService.groupPayment.count({
				where: {
					OR: [
						{ fromId: targetId },
						{ toId: targetId },
						{ creatorId: targetId }
					]
				}
			})
		])

		return {
			groupsCount,
			expensesCreatedCount,
			expensesAsPayerCount: expensesPayerCount,
			debtsCount,
			paymentsCount
		}
	}

	public async deleteUser(adminId: string, targetId: string) {
		await this.verifyAdmin(adminId)

		if (adminId === targetId) {
			throw new BadRequestException('You cannot delete yourself')
		}

		const user = await this.prismaService.user.findUnique({
			where: { id: targetId },
			select: { id: true, email: true }
		})

		if (!user) {
			throw new NotFoundException('User not found')
		}

		const [
			groupsCount,
			expensesCreatedCount,
			expensesPayerCount,
			debtsCount,
			paymentsCount
		] = await Promise.all([
			this.prismaService.groupMember.count({
				where: { userId: targetId }
			}),
			this.prismaService.expense.count({
				where: { creatorId: targetId }
			}),
			this.prismaService.expensePayment.count({
				where: { payerId: targetId }
			}),
			this.prismaService.debt.count({
				where: {
					OR: [{ debtorId: targetId }, { creditorId: targetId }]
				}
			}),
			this.prismaService.groupPayment.count({
				where: {
					OR: [
						{ fromId: targetId },
						{ toId: targetId },
						{ creatorId: targetId }
					]
				}
			})
		])

		const hasFinancialData =
			groupsCount > 0 ||
			expensesCreatedCount > 0 ||
			expensesPayerCount > 0 ||
			debtsCount > 0 ||
			paymentsCount > 0

		if (hasFinancialData) {
			throw new BadRequestException(
				'Cannot delete user with existing groups, expenses or payments'
			)
		}

		await this.prismaService.$transaction([
			this.prismaService.friendRequests.deleteMany({
				where: {
					OR: [{ senderId: targetId }, { receiverId: targetId }]
				}
			}),
			this.prismaService.token.deleteMany({
				where: { email: user.email }
			}),
			this.prismaService.account.deleteMany({
				where: { userId: targetId }
			}),
			this.prismaService.user.delete({
				where: { id: targetId }
			})
		])

		return { message: 'User deleted successfully' }
	}

	public async getRecentUsers(userId: string) {
		await this.verifyAdmin(userId)

		const users = await this.prismaService.user.findMany({
			take: 10,
			orderBy: { createdAt: 'desc' },
			select: {
				id: true,
				displayName: true,
				email: true,
				picture: true,
				method: true,
				createdAt: true
			}
		})

		return users
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
			finishedGroupsCount,
			recentUsers
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
			}),
			this.prismaService.user.findMany({
				take: 10,
				orderBy: { createdAt: 'desc' },
				select: {
					id: true,
					displayName: true,
					email: true,
					picture: true,
					method: true,
					createdAt: true
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
			expenseTypeStatistics,
			recentUsers
		}
	}
}
