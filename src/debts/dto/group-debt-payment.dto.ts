import { IsString, IsNotEmpty, IsNumber, IsPositive } from 'class-validator'

export class GroupDebtPaymentDto {
	@IsString({ message: 'validation.group_id.string' })
	@IsNotEmpty({ message: 'validation.group_id.required' })
	groupId: string

	@IsString({ message: 'validation.creditor_id.string' })
	@IsNotEmpty({ message: 'validation.creditor_id.required' })
	creditorId: string

	@IsString({ message: 'validation.debtor_id.string' })
	@IsNotEmpty({ message: 'validation.debtor_id.required' })
	debtorId: string

	@IsNumber({}, { message: 'validation.amount.number' })
	@IsPositive({ message: 'validation.amount.positive' })
	amount: number
}

export class DeleteGroupDebtPaymentDto {
	@IsString({ message: 'validation.group_id.string' })
	@IsNotEmpty({ message: 'validation.group_id.required' })
	groupId: string

	@IsString({ message: 'validation.creditor_id.string' })
	@IsNotEmpty({ message: 'validation.creditor_id.required' })
	creditorId: string

	@IsString({ message: 'validation.debtor_id.string' })
	@IsNotEmpty({ message: 'validation.debtor_id.required' })
	debtorId: string
}
