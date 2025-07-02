import { Controller, Get, HttpCode, HttpStatus } from '@nestjs/common'
import { SummaryService } from './summary.service'
import { Authorization } from '@/auth/decorators/auth.decorator'
import { Authorized } from '@/auth/decorators/authorized.decorator'

@Controller('summary')
export class SummaryController {
	constructor(private readonly summaryService: SummaryService) {}

	@Authorization()
	@HttpCode(HttpStatus.OK)
	@Get()
	public getSummaryInfo(@Authorized('id') userId: string) {
		return this.summaryService.findDataForSummary(userId)
	}
}
