import { IsIn, IsString } from 'class-validator'

export class UpdateLanguageDto {
	@IsString({ message: 'user.validation.language.required' })
	@IsIn(['EN', 'UK', 'DE', 'ES', 'FR', 'CS', 'PL', 'TR', 'HI', 'ZH'], {
		message: 'user.validation.language.enum'
	})
	language:
		| 'EN'
		| 'UK'
		| 'DE'
		| 'ES'
		| 'FR'
		| 'CS'
		| 'PL'
		| 'TR'
		| 'HI'
		| 'ZH'
}
