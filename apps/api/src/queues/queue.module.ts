import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';

import type { AppConfig } from '../config/configuration';
import { DEFAULT_JOB_OPTIONS, QUEUES } from './queue-names';

/**
 * Registers the Redis connection and the four queues. Processors live with the
 * module that owns the work (reports, ai, notifications) so the queue wiring
 * stays in one place and the business logic stays with its domain.
 */
@Global()
@Module({
  imports: [
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig, true>) => {
        const redis = config.get('redis', { infer: true });
        return {
          connection: {
            host: redis.host,
            port: redis.port,
            password: redis.password,
            // BullMQ requires this; without it a blocking command can throw.
            maxRetriesPerRequest: null,
          },
          defaultJobOptions: DEFAULT_JOB_OPTIONS,
        };
      },
    }),
    BullModule.registerQueue(
      { name: QUEUES.reports },
      { name: QUEUES.ai },
      { name: QUEUES.notifications },
      { name: QUEUES.reminders },
    ),
  ],
  exports: [BullModule],
})
export class QueueModule {}
