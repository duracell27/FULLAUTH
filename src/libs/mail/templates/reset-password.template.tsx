import { Body, Heading, Link, Tailwind, Text } from '@react-email/components'
import { Html } from '@react-email/html'
import * as React from 'react'

interface ResetPasswordTemplateProps {
	domain: string
	token: string
}

export function ResetPasswordTemplate({
	domain,
	token
}: ResetPasswordTemplateProps) {
	const resetLink = `${domain}/auth/new-password?token=${token}`

	return (
		<Tailwind>
			<Html>
				<Body className='text-black'>
					<Heading>Password Reset</Heading>
					<Text>
						Hello! You requested a password reset. Please follow
						this link to create a new password:
					</Text>
					<Link href={resetLink}>Confirm Password Reset</Link>
					<Text>
						This link is valid for 1 hour. If you did not request a
						password reset, simply ignore this message.
					</Text>
				</Body>
			</Html>
		</Tailwind>
	)
}
