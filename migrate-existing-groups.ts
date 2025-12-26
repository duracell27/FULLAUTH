import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'
import 'dotenv/config'

// Складаємо URL зі змінних
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

const pool = new Pool({ connectionString: DATABASE_URL })
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter })

async function main() {
	// Знаходимо всі групи без simplificationExpenseId
	const groupsWithoutSystemExpense = await prisma.groupEntity.findMany({
		where: {
			simplificationExpenseId: null
		},
		include: {
			members: {
				take: 1,
				orderBy: {
					joinedAt: 'asc'
				}
			}
		}
	})

	console.log(
		`Found ${groupsWithoutSystemExpense.length} groups without system expense`
	)

	for (const group of groupsWithoutSystemExpense) {
		const creatorId =
			group.members.length > 0 ? group.members[0].userId : 'unknown'

		console.log(`Processing group: ${group.name} (${group.id})`)

		await prisma.$transaction(async tx => {
			// Створюємо системну витрату
			const systemExpense = await tx.expense.create({
				data: {
					groupId: group.id,
					creatorId: creatorId,
					description: 'Simplified debts',
					amount: 0,
					date: new Date()
				}
			})

			// Оновлюємо групу
			await tx.groupEntity.update({
				where: { id: group.id },
				data: {
					simplificationExpenseId: systemExpense.id
				}
			})

			console.log(`  Created system expense: ${systemExpense.id}`)
		})
	}

	console.log('Migration completed!')
}

main()
	.catch(e => {
		console.error(e)
		process.exit(1)
	})
	.finally(async () => {
		await prisma.$disconnect()
		await pool.end()
	})
