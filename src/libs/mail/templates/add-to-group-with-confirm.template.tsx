import { Body, Heading, Link, Tailwind, Text } from '@react-email/components'
import { Html } from '@react-email/html'
import * as React from 'react'

interface GroupInvitationWithReviewProps {
	domain: string
	groupName: string
	userName: string
}

export function GroupInvitationWithConfirmTemplate({
	domain,
	groupName,
	userName
}: GroupInvitationWithReviewProps) {
	return (
		<Tailwind>
			<Html>
				<Body className='text-black'>
					<Heading>Group Invitation</Heading>
					<Text>
						Hello {userName}! You've been invited to join the{' '}
						<strong>{groupName}</strong> group.
					</Text>

					<Text>
						You can visit your groups page to manage your
						invitations:
					</Text>
					<Link href={`${domain}/groups`}>View Groups</Link>
				</Body>
			</Html>
		</Tailwind>
	)
}
