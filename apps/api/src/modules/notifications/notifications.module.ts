import { Global, Module } from '@nestjs/common';

import { NotificationsController } from './notifications.controller';
import { NotificationsProcessor } from './notifications.processor';
import { NotificationsService } from './notifications.service';
import { PushService } from './push.service';
import { RemindersProcessor, RemindersScheduler } from './reminders.processor';

/**
 * Global because findings, EOD and access requests all raise notifications.
 * The processors are registered here too; `QUEUE_CONCURRENCY=0` keeps them idle
 * on the HTTP process when the worker runs separately.
 */
@Global()
@Module({
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    PushService,
    NotificationsProcessor,
    RemindersProcessor,
    RemindersScheduler,
  ],
  exports: [NotificationsService, PushService],
})
export class NotificationsModule {}
