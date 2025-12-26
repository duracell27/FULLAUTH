import 'dotenv/config'
import { defineConfig } from 'prisma/config'

// Складаємо URL зі змінних, оскільки dotenv не підтримує вкладені змінні
const POSTGRES_USER = process.env.POSTGRES_USER?.replace(/'/g, '')
const POSTGRES_PASSWORD = process.env.POSTGRES_PASSWORD?.replace(/'/g, '')
const POSTGRES_HOST = process.env.POSTGRES_HOST?.replace(/'/g, '')
const POSTGRES_PORT = process.env.POSTGRES_PORT
const POSTGRES_DB = process.env.POSTGRES_DB?.replace(/'/g, '')

if (
	!POSTGRES_USER ||
	!POSTGRES_PASSWORD ||
	!POSTGRES_HOST ||
	!POSTGRES_PORT ||
	!POSTGRES_DB
) {
	throw new Error('Missing required database environment variables')
}

const DATABASE_URL = `postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@${POSTGRES_HOST}:${POSTGRES_PORT}/${POSTGRES_DB}`

export default defineConfig({
	schema: 'prisma/schema.prisma',
	datasource: {
		url: DATABASE_URL
	}
})
