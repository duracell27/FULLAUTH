import { Injectable, ExecutionContext } from '@nestjs/common'
import { I18nResolver } from 'nestjs-i18n'

interface RequestWithUser {
	user?: { language?: string }
	session?: { lang?: string }
	cookies?: { lang?: string }
	headers?: { 'accept-language'?: string }
}

@Injectable()
export class UserPreferredLanguageResolver implements I18nResolver {
	resolve(ctx: ExecutionContext): string | string[] | undefined {
		const req = ctx.switchToHttp().getRequest<RequestWithUser>()

		// Пріоритет: user.language -> session.lang -> cookie.lang -> Accept-Language
		const language =
			req?.user?.language ||
			req?.session?.lang ||
			req?.cookies?.lang ||
			req?.headers?.['accept-language']?.split(',')[0]?.split('-')[0]

		// Повертаємо тільки валідні мови, інакше undefined
		return language &&
			[
				'en',
				'uk',
				'de',
				'es',
				'fr',
				'cs',
				'pl',
				'tr',
				'hi',
				'zh'
			].includes(language)
			? language
			: undefined
	}
}
