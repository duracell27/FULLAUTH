import * as crypto from 'crypto'

const ALGORITHM = 'aes-256-gcm'

function getKey(): Buffer {
	const key = process.env.CARD_ENCRYPTION_KEY
	if (!key || key.length !== 64) {
		throw new Error(
			'CARD_ENCRYPTION_KEY must be set as a 64-character hex string (32 bytes)'
		)
	}
	return Buffer.from(key, 'hex')
}

export function encryptCardNumber(cardNumber: string): string {
	const iv = crypto.randomBytes(12)
	const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv)
	const encrypted = Buffer.concat([
		cipher.update(cardNumber, 'utf8'),
		cipher.final()
	])
	const authTag = cipher.getAuthTag()
	return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`
}

export function decryptCardNumber(encrypted: string): string {
	const parts = encrypted.split(':')
	if (parts.length !== 3) return encrypted

	const [ivHex, authTagHex, ciphertextHex] = parts
	const iv = Buffer.from(ivHex, 'hex')
	const authTag = Buffer.from(authTagHex, 'hex')
	const ciphertext = Buffer.from(ciphertextHex, 'hex')

	const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), iv)
	decipher.setAuthTag(authTag)
	return (
		decipher.update(ciphertext).toString('utf8') + decipher.final('utf8')
	)
}
