/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/require-await */
/* eslint-disable @typescript-eslint/no-unsafe-return */
import {
	BadRequestException,
	Injectable,
	UnauthorizedException
} from '@nestjs/common'
import { TypeBaseProviderOptions } from './types/base-provider.options.types'
import { TypeUserInfo } from './types/user-info.types'

@Injectable()
export class BaseOAuthService {
	private BASE_URL: string
	constructor(private readonly options: TypeBaseProviderOptions) {}

	protected async extractUserInfo(data: any): Promise<TypeUserInfo> {
		return {
			...data,
			provider: this.options.name
		}
	}

	public getAuthUrl() {
		const query = new URLSearchParams({
			response_type: 'code',
			client_id: this.options.client_id,
			redirect_uri: this.getRedirectUrl(),
			scope: (this.options.scopes || []).join(' '),
			access_type: 'offline',
			prompt: 'select_account'
		})

		return `${this.options.authorizeUrl}?${query}`
	}

	public async findUserByCode(code: string): Promise<TypeUserInfo> {
		const client_id = this.options.client_id
		const client_secret = this.options.client_secret

		const tokenQuery = new URLSearchParams({
			client_id,
			client_secret,
			code,
			redirect_uri: this.getRedirectUrl(),
			grant_type: 'authorization_code'
		})

		const tokenRequest = await fetch(this.options.access_url, {
			method: 'POST',
			body: tokenQuery,
			headers: {
				'Content-Type': 'application/x-www-form-urlencoded',
				Accept: 'application/json'
			}
		})

		if (!tokenRequest.ok) {
			throw new BadRequestException(
				`Cannot get user info from ${this.options.profile_url}`
			)
		}
		const tokenResponse = await tokenRequest.json()

		if (!tokenResponse.access_token) {
			throw new BadRequestException(
				`Cannot get token info from ${this.options.access_url}`
			)
		}

		const userRequest = await fetch(this.options.profile_url, {
			method: 'GET',
			headers: {
				Authorization: `Bearer ${tokenResponse.access_token}`
			}
		})

		if (!userRequest.ok) {
			throw new UnauthorizedException(
				`Cannot get user info from ${this.options.profile_url}`
			)
		}

		const user = await userRequest.json()
		const userData = await this.extractUserInfo(user)

		return {
			...userData,
			access_token: tokenResponse.access_token,
			refresh_token: tokenResponse.refresh_token,
			expires_at: tokenResponse.expires_at || tokenResponse.expires_in,
			provider: this.options.name
		}
	}

	public getRedirectUrl() {
		return `${this.BASE_URL}/auth/oauth/callback/${this.options.name}`
	}

	set baseUrl(value: string) {
		this.BASE_URL = value
	}

	get name() {
		return this.options.name
	}

	get access_url() {
		return this.options.access_url
	}

	get profile_url() {
		return this.options.profile_url
	}

	get scopes() {
		return this.options.scopes
	}
}
