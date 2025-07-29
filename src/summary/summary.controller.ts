import {
	Body,
	Controller,
	Get,
	HttpCode,
	HttpStatus,
	Post
} from '@nestjs/common'
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

	@Authorization()
	@HttpCode(HttpStatus.OK)
	@Post('settle-up')
	public settleUpBalances(
		@Authorized('id') userId: string,
		@Body('settlerUserId') settlerUserId: string
	) {
		return this.summaryService.settleUpBalances(userId, settlerUserId)
	}
}
