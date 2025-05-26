import {
	IsString,
	IsNotEmpty,
	MaxLength,
	IsDate,
	IsOptional,
	IsBoolean
} from 'class-validator'
import { Type } from 'class-transformer'

export class UpdateGroupDto {
	@IsString()
	@IsNotEmpty({ message: 'Group id is required' })
	groupId: string

	@IsString()
	@IsNotEmpty({ message: 'Name is required' })
	@MaxLength(100, { message: 'Name must be less than 100 characters' })
	@IsOptional()
	name?: string

	@IsString()
	@IsOptional()
	avatarUrl?: string

	@IsDate()
	@Type(() => Date)
	@IsOptional()
	eventDate?: Date

	@IsBoolean()
	@IsOptional()
	isLocked?: boolean

	@IsBoolean()
	@IsOptional()
	isFinished?: boolean
}
