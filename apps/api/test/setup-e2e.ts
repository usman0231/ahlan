/**
 * e2e setup.
 *
 * These tests need the real stack from `docker compose up -d`. Rather than
 * failing with a confusing connection error on a machine that has not started
 * it, the suite checks the database first and tells you what to run.
 */

import { Client } from 'pg';

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL ??=
  'postgresql://ahlan:ahlan@localhost:5432/ahlan_hse_test?schema=public';

// Deterministic, obviously-not-production secrets for the test run.
process.env.JWT_ACCESS_SECRET ??= 'test-access-secret-0000000000000000000000';
process.env.JWT_REFRESH_SECRET ??= 'test-refresh-secret-000000000000000000000';
process.env.S3_ENDPOINT ??= 'http://localhost:9000';
process.env.S3_ACCESS_KEY_ID ??= 'ahlan';
process.env.S3_SECRET_ACCESS_KEY ??= 'ahlan-secret';
process.env.S3_BUCKET_EVIDENCE ??= 'ahlan-evidence';
process.env.S3_BUCKET_REPORTS ??= 'ahlan-reports';
// No in-process job workers during e2e: the tests assert on HTTP behaviour.
process.env.QUEUE_CONCURRENCY = '0';
process.env.AI_PROVIDER = 'local';

jest.setTimeout(60_000);

beforeAll(async () => {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  try {
    await client.connect();

    // Each suite assumes a clean database: the helpers seed fixed demo
    // emails, and a leftover row from the previous suite turns every later
    // seed into a unique-constraint failure. Truncating here (suites run
    // with --runInBand) is what makes the suites order-independent.
    const tables = await client.query<{ tablename: string }>(
      `SELECT tablename FROM pg_tables
        WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`,
    );
    if (tables.rows.length > 0) {
      const list = tables.rows.map((row) => `"public"."${row.tablename}"`).join(', ');
      await client.query(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
    }

    await client.end();
  } catch (error) {
    throw new Error(
      [
        '',
        'e2e tests need Postgres running.',
        '',
        '  docker compose up -d',
        '  pnpm --filter api prisma migrate deploy',
        '',
        `Tried: ${process.env.DATABASE_URL}`,
        `Cause: ${(error as Error).message}`,
        '',
      ].join('\n'),
    );
  }
});
