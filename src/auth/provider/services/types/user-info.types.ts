export type TypeUserInfo = {
	id: string
	email: string
	name: string
	picture: string
	access_token?: string | null
	refresh_token?: string
	expires_at?: number
	provider: string
}
