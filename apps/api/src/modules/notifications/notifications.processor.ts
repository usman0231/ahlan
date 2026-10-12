import { Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import type { Job } from 'bullmq';

import { PrismaService } from '../../prisma/prisma.service';
import type { AppConfig } from '../../config/configuration';
import { JOBS, QUEUES } from '../../queues/queue-names';
import { PushService } from './push.service';

interface SendNotificationJob {
  notificationId: string;
}

/** Delivers a stored notification to the user's devices. */
@Processor(QUEUES.notifications)
export class NotificationsProcessor extends WorkerHost {
  private readonly logger = new Logger(NotificationsProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly push: PushService,
    private readonly config: ConfigService<AppConfig, true>,
  ) {
    super();
  }

  override async process(job: Job<SendNotificationJob>): Promise<{ delivered: number }> {
    if (job.name !== JOBS.sendNotification) {
      this.logger.warn(`Ignoring unknown job ${job.name}`);
      return { delivered: 0 };
    }

    const notification = await this.prisma.notification.findUnique({
      where: { id: job.data.notificationId },
    });
    if (!notification) {
      // Deleted between enqueue and processing: nothing to deliver.
      return { delivered: 0 };
    }

    const data: Record<string, string> = {
      kind: notification.kind,
      notificationId: notification.id,
    };
    if (notification.route) data.route = notification.route;

    const delivered = await this.push.sendToUser(notification.userId, {
      title: notification.title,
      body: notification.body,
      data,
    });

    if (this.config.get('env', { infer: true }) === 'development') {
      this.logger.debug(
        `${notification.kind} -> user ${notification.userId} (${delivered} device(s))`,
      );
    }
    return { delivered };
  }
}
