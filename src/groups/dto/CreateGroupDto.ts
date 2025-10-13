import {
	IsString,
	IsNotEmpty,
	MaxLength,
	IsDate,
	IsOptional,
	IsBoolean
} from 'class-validator'
import { Type } from 'class-transformer'

export class CreateGroupDto {
	@IsString({ message: 'groups.validation.name.string' })
	@IsNotEmpty({ message: 'groups.validation.name.required' })
	@MaxLength(100, { message: 'groups.validation.name.max_length' })
	name: string

	@IsString({ message: 'groups.validation.avatar_url.string' })
	@IsOptional()
	avatarUrl?: string

	@IsDate({ message: 'groups.validation.event_date.date' })
	@Type(() => Date)
	@IsOptional()
	eventDate?: Date

	@IsBoolean({ message: 'groups.validation.is_locked.boolean' })
	@IsOptional()
	isLocked?: boolean

	@IsBoolean({ message: 'groups.validation.is_finished.boolean' })
	@IsOptional()
	isFinished?: boolean
}
