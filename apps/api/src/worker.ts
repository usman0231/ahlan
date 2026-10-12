import 'reflect-metadata';

import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module';

/**
 * The background worker.
 *
 * Same module graph, no HTTP listener: the BullMQ processors registered by the
 * reports, AI and notifications modules come up and start consuming. Running
 * this as its own process is how a 40-second tournament PDF render stops
 * competing with inspectors submitting in the field.
 *
 *   pnpm --filter api dev:worker     # development
 *   pnpm --filter api start:worker   # built
 *
 * Set QUEUE_CONCURRENCY=0 on the HTTP process when this one is running, so jobs
 * are not picked up twice.
 */
async function bootstrap(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, {
    bufferLogs: true,
  });
  const logger = new Logger('Worker');

  app.enableShutdownHooks();

  // Chromium and the Redis connections need to close cleanly, or a redeploy
  // leaves orphaned browser processes behind.
  const shutdown = async (signal: string): Promise<void> => {
    logger.log(`${signal} received, shutting down`);
    await app.close();
    process.exit(0);
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  logger.log('Worker ready: reports, ai, notifications, reminders');
}

void bootstrap();
