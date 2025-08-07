export class GroupDebtPaymentDto {
	groupId: string
	creditorId: string
	debtorId: string
	amount: number
}

export class DeleteGroupDebtPaymentDto {
	groupId: string
	creditorId: string
	debtorId: string
}
