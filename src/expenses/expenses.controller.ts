import {
	Body,
	Controller,
	Delete,
	Get,
	HttpCode,
	HttpStatus,
	Param,
	Post
} from '@nestjs/common'
import { ExpensesService } from './expenses.service'
import { Authorization } from '@/auth/decorators/auth.decorator'
import { Authorized } from '@/auth/decorators/authorized.decorator'
import { CreateExpenseDto } from './dto/CreateExpense.dto'

@Controller('expenses')
export class ExpensesController {
	constructor(private readonly expensesService: ExpensesService) {}

	@Authorization()
	@HttpCode(HttpStatus.OK)
	@Post('add')
	public addExpense(
		@Authorized('id') userId: string,
		@Body() dto: CreateExpenseDto
	) {
		return this.expensesService.addExpense(dto, userId)
	}

	@Authorization()
	@HttpCode(HttpStatus.OK)
	@Get(':expenseId')
	public getExpenseInfo(
		@Param('expenseId') groupId: string,
		@Authorized('id') userId: string
	) {
		return this.expensesService.getExpenseInfo(groupId, userId)
	}

	@Authorization()
	@HttpCode(HttpStatus.OK)
	@Delete(':expenseId')
	public deleteExpense(
		@Param('expenseId') groupId: string,
		@Authorized('id') userId: string
	) {
		return this.expensesService.deleteExpense(groupId, userId)
	}
}
