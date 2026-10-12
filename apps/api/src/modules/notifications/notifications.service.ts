import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Prisma, type NotificationKind } from '@prisma/client';
import type { Queue } from 'bullmq';
import {
  uuidv7,
  type ListNotificationsQuery,
  type MarkNotificationsReadInput,
  type Paginated,
  type RegisterPushTokenInput,
} from '@ahlan/shared';

import { PrismaService } from '../../prisma/prisma.service';
import { cursorArgs, paginateById } from '../../common/util/cursor';
import { JOBS, QUEUES } from '../../queues/queue-names';
import { enqueue } from '../../queues/enqueue';
import { AppException } from '../../common/errors/app.exception';

export interface NotificationPayload {
  userId: string;
  kind: NotificationKind;
  title: string;
  body: string;
  route?: string | null;
  data?: Record<string, string> | null;
}

/**
 * In-app notifications plus push delivery.
 *
 * The row is written synchronously so the badge count is right immediately;
 * push delivery is queued, because a slow or dead push provider must not slow
 * down an inspector submitting in the field.
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(QUEUES.notifications) private readonly queue: Queue,
  ) {}

  async notify(payload: NotificationPayload): Promise<string> {
    const id = uuidv7();
    await this.prisma.notification.create({
      data: {
        id,
        userId: payload.userId,
        kind: payload.kind,
        title: payload.title,
        body: payload.body,
        route: payload.route ?? null,
        data: (payload.data ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    });

    await this.enqueuePush(id);
    return id;
  }

  /** One row per recipient; used for "all admins" style fan-out. */
  async notifyMany(userIds: string[], payload: Omit<NotificationPayload, 'userId'>): Promise<void> {
    const unique = [...new Set(userIds)];
    if (unique.length === 0) return;

    const rows = unique.map((userId) => ({
      id: uuidv7(),
      userId,
      kind: payload.kind,
      title: payload.title,
      body: payload.body,
      route: payload.route ?? null,
      data: (payload.data ?? undefined) as Prisma.InputJsonValue | undefined,
    }));

    await this.prisma.notification.createMany({ data: rows });
    await Promise.all(rows.map((row) => this.enqueuePush(row.id)));
  }

  async notifyAllAdmins(payload: Omit<NotificationPayload, 'userId'>): Promise<void> {
    const admins = await this.prisma.user.findMany({
      where: { role: 'ADMIN', status: 'ACTIVE', deletedAt: null },
      select: { id: true },
    });
    await this.notifyMany(
      admins.map((admin) => admin.id),
      payload,
    );
  }

  async list(
    userId: string,
    query: ListNotificationsQuery,
  ): Promise<Paginated<NotificationRow>> {
    const rows = await this.prisma.notification.findMany({
      where: {
        userId,
        kind: query.kind,
        ...(query.unreadOnly ? { readAt: null } : {}),
      },
      orderBy: { id: 'desc' },
      take: query.limit + 1,
      ...cursorArgs(query.cursor),
    });
    return paginateById(rows as NotificationRow[], query.limit);
  }

  async unreadCount(userId: string): Promise<number> {
    return this.prisma.notification.count({ where: { userId, readAt: null } });
  }

  /** An empty id list means "mark everything read". */
  async markRead(userId: string, input: MarkNotificationsReadInput): Promise<number> {
    const result = await this.prisma.notification.updateMany({
      where: {
        userId,
        readAt: null,
        ...(input.ids.length > 0 ? { id: { in: input.ids } } : {}),
      },
      data: { readAt: new Date() },
    });
    return result.count;
  }

  async registerPushToken(userId: string, input: RegisterPushTokenInput): Promise<void> {
    // A device that was handed to another inspector must stop getting the old
    // user's notifications, so the token is re-pointed rather than duplicated.
    await this.prisma.pushToken.upsert({
      where: { token: input.token },
      create: {
        id: uuidv7(),
        userId,
        token: input.token,
        platform: input.platform,
        deviceId: input.deviceId,
        appVersion: input.appVersion ?? null,
      },
      update: {
        userId,
        platform: input.platform,
        deviceId: input.deviceId,
        appVersion: input.appVersion ?? null,
        lastSeenAt: new Date(),
      },
    });
  }

  async removePushToken(userId: string, token: string): Promise<void> {
    const existing = await this.prisma.pushToken.findUnique({ where: { token } });
    if (!existing) throw AppException.notFound('Push token');
    if (existing.userId !== userId) throw AppException.forbidden();
    await this.prisma.pushToken.delete({ where: { token } });
  }

  private async enqueuePush(notificationId: string): Promise<void> {
    try {
      // Bounded: a dead Redis would otherwise hang the request that raised
      // this notification, because BullMQ's connection retries forever.
      await enqueue(this.queue, JOBS.sendNotification, { notificationId });
    } catch (error) {
      // The in-app notification already exists; push is best-effort.
      this.logger.warn(`Could not queue push for ${notificationId}: ${(error as Error).message}`);
    }
  }
}

export interface NotificationRow {
  id: string;
  userId: string;
  kind: NotificationKind;
  title: string;
  body: string;
  route: string | null;
  data: unknown;
  readAt: Date | null;
  createdAt: Date;
}
