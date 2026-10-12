import { Logger } from '@nestjs/common';
import type { Queue } from 'bullmq';

/**
 * Enqueues a job with a hard deadline.
 *
 * BullMQ requires `maxRetriesPerRequest: null` on its Redis connection, which
 * means ioredis retries a dead server forever rather than erroring. `queue.add`
 * therefore never rejects when Redis is down - it simply never settles, and the
 * HTTP request that triggered it hangs until the client gives up.
 *
 * Racing it against a timer turns that into a failure the caller can act on:
 * notifications swallow it and degrade, while a report request surfaces it so
 * the admin is told to try again instead of waiting on a job that was never
 * queued.
 */
const DEFAULT_TIMEOUT_MS = 5_000;

const logger = new Logger('Queue');

export class QueueUnavailableError extends Error {
  constructor(queueName: string) {
    super(`The ${queueName} queue is unavailable`);
    this.name = 'QueueUnavailableError';
  }
}

/**
 * BullMQ rejects a custom job id containing `:` ("Custom Id cannot contain :")
 * unless it happens to split into exactly three parts, which it reserves for
 * repeatable jobs. Callers build ids like `report:<uuid>`, so normalise here
 * once rather than trusting every call site to remember.
 */
export function toJobId(raw: string): string {
  return raw.replaceAll(':', '-');
}

export async function enqueue<T>(
  queue: Queue,
  name: string,
  data: T,
  options: { jobId?: string; timeoutMs?: number } = {},
): Promise<void> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  let timer: NodeJS.Timeout | undefined;

  const deadline = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new QueueUnavailableError(queue.name)), timeoutMs);
    // Do not hold the process open just for this timer.
    timer.unref?.();
  });

  try {
    await Promise.race([
      queue.add(name, data, options.jobId ? { jobId: toJobId(options.jobId) } : undefined),
      deadline,
    ]);
  } catch (error) {
    if (error instanceof QueueUnavailableError) {
      logger.warn(`${queue.name}: could not enqueue ${name} within ${timeoutMs}ms`);
    }
    throw error;
  } finally {
    if (timer) clearTimeout(timer);
  }
}
