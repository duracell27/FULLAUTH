import {
	Controller,
	Get,
	Post,
	Body,
	Patch,
	Param,
	Delete,
	HttpCode,
	HttpStatus
} from '@nestjs/common'
import { NotificationsService } from './notifications.service'
import { CreateNotificationDto } from './dto/create-notification.dto'
import { UpdateNotificationDto } from './dto/update-notification.dto'
import { Authorized } from '@/auth/decorators/authorized.decorator'
import { Authorization } from '@/auth/decorators/auth.decorator'

@Controller('notifications')
export class NotificationsController {
	constructor(private readonly notificationsService: NotificationsService) {}

	@Authorization()
	@HttpCode(HttpStatus.OK)
	@Post()
	create(@Body() createNotificationDto: CreateNotificationDto) {
		return this.notificationsService.create(createNotificationDto)
	}

	@Authorization()
	@HttpCode(HttpStatus.OK)
	@Get()
	findAll(@Authorized('id') userId: string) {
		return this.notificationsService.findAllByUserId(userId)
	}

	@Authorization()
	@HttpCode(HttpStatus.OK)
	@Get('unread')
	findUnread(@Authorized('id') userId: string) {
		return this.notificationsService.findUnreadByUserId(userId)
	}

	@Authorization()
	@HttpCode(HttpStatus.OK)
	@Get(':id')
	findOne(@Param('id') id: string) {
		return this.notificationsService.findOne(id)
	}

	@Authorization()
	@HttpCode(HttpStatus.OK)
	@Patch(':id/read')
	markAsRead(@Param('id') id: string) {
		return this.notificationsService.markAsRead(id)
	}

	@Authorization()
	@HttpCode(HttpStatus.OK)
	@Patch('mark-all-read')
	markAllAsRead(@Authorized('id') userId: string) {
		return this.notificationsService.markAllAsRead(userId)
	}

	@Authorization()
	@HttpCode(HttpStatus.OK)
	@Patch(':id')
	update(
		@Param('id') id: string,
		@Body() updateNotificationDto: UpdateNotificationDto
	) {
		return this.notificationsService.update(id, updateNotificationDto)
	}

	@Authorization()
	@HttpCode(HttpStatus.OK)
	@Delete(':id')
	remove(@Param('id') id: string) {
		return this.notificationsService.remove(id)
	}
}
