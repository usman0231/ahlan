import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';

import { softDeleteExtension } from './soft-delete';

/**
 * The only place the application talks to Postgres. Services inject this; no
 * controller ever touches it.
 *
 * The instance Nest receives is the client with `softDeleteExtension` applied
 * (the constructor returns it), so every read of a soft-deletable HSE model -
 * including inside interactive transactions - excludes soft-deleted rows unless
 * the query opts out explicitly. See soft-delete.ts.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super({
      log: [
        { emit: 'event', level: 'warn' },
        { emit: 'event', level: 'error' },
      ],
    });
    // `$on` only exists on the base client, so the listeners are wired here,
    // before extending. Prisma's typed event emitter needs the cast; the
    // payload shape is stable.
    const on = this.$on.bind(this) as unknown as (
      event: string,
      cb: (e: { message: string }) => void,
    ) => void;
    on('warn', (event) => this.logger.warn(event.message));
    on('error', (event) => this.logger.error(event.message));
    // The extended client proxies every other member (methods below included)
    // back to this instance, so typing it as `this` is accurate for callers.
    return this.$extends(softDeleteExtension) as unknown as this;
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  /**
   * Wipes every table, respecting foreign keys. Test-only: it refuses to run
   * against anything but a test database.
   */
  async truncateAll(): Promise<void> {
    if (process.env.NODE_ENV !== 'test') {
      throw new Error('truncateAll() is only available with NODE_ENV=test');
    }
    const tables = await this.$queryRaw<{ tablename: string }[]>(
      Prisma.sql`SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`,
    );
    if (tables.length === 0) return;
    const list = tables.map((row) => `"public"."${row.tablename}"`).join(', ');
    await this.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
  }
}
