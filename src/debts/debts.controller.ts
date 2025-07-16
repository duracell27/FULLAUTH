import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common'
import { DebtsService } from './debts.service'
import { Authorization } from '@/auth/decorators/auth.decorator'
import { Authorized } from '@/auth/decorators/authorized.decorator'
import { GroupDebtPaymentDto } from './dto/group-debt-payment.dto'

@Controller('debts')
export class DebtsController {
	constructor(private readonly debtsService: DebtsService) {}

	@Authorization()
	@HttpCode(HttpStatus.OK)
	@Post('pay-group')
	public payGroupDebts(
		@Authorized('id') userId: string,
		@Body() dto: GroupDebtPaymentDto
	) {
		return this.debtsService.addDebtPay(dto, userId)
	}
}
