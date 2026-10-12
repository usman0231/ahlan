import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  listNotificationsQuerySchema,
  markNotificationsReadSchema,
  registerPushTokenSchema,
  type ListNotificationsQuery,
  type MarkNotificationsReadInput,
  type RegisterPushTokenInput,
} from '@ahlan/shared';

import { ApiZodBody, ApiZodQuery, CurrentUser } from '../../common/decorators';
import { zodBody, zodQuery } from '../../common/pipes/zod-validation.pipe';
import type { RequestUser } from '../../common/types/request-user';
import { NotificationsService } from './notifications.service';

@ApiTags('notifications')
@ApiBearerAuth()
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  @ApiOperation({ summary: "List the caller's notifications" })
  @ApiZodQuery(listNotificationsQuerySchema)
  list(
    @CurrentUser() user: RequestUser,
    @Query(zodQuery(listNotificationsQuerySchema)) query: ListNotificationsQuery,
  ) {
    return this.notifications.list(user.id, query);
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'Unread badge count' })
  async unreadCount(@CurrentUser() user: RequestUser) {
    return { unread: await this.notifications.unreadCount(user.id) };
  }

  @Patch('read')
  @ApiOperation({ summary: 'Mark notifications read (empty list marks all)' })
  @ApiZodBody(markNotificationsReadSchema)
  async markRead(
    @CurrentUser() user: RequestUser,
    @Body(zodBody(markNotificationsReadSchema)) body: MarkNotificationsReadInput,
  ) {
    return { updated: await this.notifications.markRead(user.id, body) };
  }

  @Post('push-tokens')
  @ApiOperation({ summary: 'Register this device for push' })
  @ApiZodBody(registerPushTokenSchema)
  async registerPushToken(
    @CurrentUser() user: RequestUser,
    @Body(zodBody(registerPushTokenSchema)) body: RegisterPushTokenInput,
  ) {
    await this.notifications.registerPushToken(user.id, body);
    return { registered: true };
  }

  @Delete('push-tokens/:token')
  @ApiOperation({ summary: 'Unregister this device (called on sign-out)' })
  async removePushToken(@CurrentUser() user: RequestUser, @Param('token') token: string) {
    await this.notifications.removePushToken(user.id, token);
    return { removed: true };
  }
}
