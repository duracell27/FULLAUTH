import { Body, Heading, Link, Tailwind, Text } from '@react-email/components'
import { Html } from '@react-email/html'
import * as React from 'react'

// Template 1: Notification of Being Added to a Group
interface GroupAddedNotificationProps {
	domain: string
	groupName: string
	userName: string
}

export function GroupAddedNotificationTemplate({
	domain,
	groupName,
	userName
}: GroupAddedNotificationProps) {
	return (
		<Tailwind>
			<Html>
				<Body className='text-black'>
					<Heading>Group invite!</Heading>
					<Text>
						Hello {userName}! You've been added to the{' '}
						<strong>{groupName}</strong> group.
					</Text>

					<Link href={`${domain}/groups`}>View Groups</Link>
				</Body>
			</Html>
		</Tailwind>
	)
}
