import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common'
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
}
