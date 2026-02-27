import {
	Controller,
	Delete,
	Get,
	HttpCode,
	HttpStatus,
	Param
} from '@nestjs/common'
import { AdminService } from './admin.service'
import { Authorization } from '@/auth/decorators/auth.decorator'
import { Authorized } from '@/auth/decorators/authorized.decorator'
import { UserRole } from '@prisma/client'

@Controller('admin')
export class AdminController {
	constructor(private readonly adminService: AdminService) {}

	@Authorization(UserRole.ADMIN)
	@HttpCode(HttpStatus.OK)
	@Get('users/count')
	public async getUsersCount(@Authorized('id') userId: string) {
		return this.adminService.getUsersCount(userId)
	}

	@Authorization(UserRole.ADMIN)
	@HttpCode(HttpStatus.OK)
	@Get('expenses/count')
	public async getExpensesCount(@Authorized('id') userId: string) {
		return this.adminService.getExpensesCount(userId)
	}

	@Authorization(UserRole.ADMIN)
	@HttpCode(HttpStatus.OK)
	@Get('expenses/statistics')
	public async getExpenseTypeStatistics(@Authorized('id') userId: string) {
		return this.adminService.getExpenseTypeStatistics(userId)
	}

	@Authorization(UserRole.ADMIN)
	@HttpCode(HttpStatus.OK)
	@Get('groups/count')
	public async getGroupsCount(@Authorized('id') userId: string) {
		return this.adminService.getGroupsCount(userId)
	}

	@Authorization(UserRole.ADMIN)
	@HttpCode(HttpStatus.OK)
	@Get('users/:id/stats')
	public async getUserStats(
		@Authorized('id') adminId: string,
		@Param('id') targetId: string
	) {
		return this.adminService.getUserStats(adminId, targetId)
	}

	@Authorization(UserRole.ADMIN)
	@HttpCode(HttpStatus.OK)
	@Delete('users/:id')
	public async deleteUser(
		@Authorized('id') adminId: string,
		@Param('id') targetId: string
	) {
		return this.adminService.deleteUser(adminId, targetId)
	}

	@Authorization(UserRole.ADMIN)
	@HttpCode(HttpStatus.OK)
	@Get('dashboard')
	public async getDashboardStatistics(@Authorized('id') userId: string) {
		return this.adminService.getDashboardStatistics(userId)
	}
}
