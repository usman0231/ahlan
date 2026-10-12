import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import request from 'supertest';
import { hash } from 'bcryptjs';
import { uuidv7, type Role } from '@ahlan/shared';

import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import type { AppConfig } from '../src/config/configuration';

export const TEST_PASSWORD = 'Stadium2026!';

export interface TestContext {
  app: INestApplication;
  prisma: PrismaService;
  http: () => request.Agent;
  close: () => Promise<void>;
}

/** Boots the real application once per suite. */
export async function createTestApp(): Promise<TestContext> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();

  const app = moduleRef.createNestApplication();
  const config = app.get(ConfigService<AppConfig, true>);
  app.useGlobalFilters(new AllExceptionsFilter());
  app.setGlobalPrefix(config.get('apiPrefix', { infer: true }), {
    exclude: ['health', 'health/ready'],
  });
  await app.init();

  const prisma = app.get(PrismaService);

  return {
    app,
    prisma,
    http: () => request(app.getHttpServer()),
    close: async () => {
      await app.close();
    },
  };
}

export function api(path: string): string {
  return `/api/v1${path}`;
}

export interface SeededUser {
  id: string;
  email: string;
  role: Role;
  stadiumIds: string[];
  accessToken: string;
}

/** Inserts a user directly, then signs in through the real endpoint. */
export async function seedUser(
  ctx: TestContext,
  options: { role: Role; stadiumIds?: string[]; email?: string },
): Promise<SeededUser> {
  const id = uuidv7();
  // The TAIL of a UUIDv7 is the random part; the head is a millisecond
  // timestamp whose first eight hex chars only roll over every ~65 seconds,
  // which made every user seeded in one run share an email.
  const email = options.email ?? `${options.role.toLowerCase()}-${id.slice(-12)}@example.test`;
  const stadiumIds = options.stadiumIds ?? [];

  await ctx.prisma.user.create({
    data: {
      id,
      email,
      passwordHash: await hash(TEST_PASSWORD, 4), // low cost: these are throwaway
      fullName: `Test ${options.role}`,
      role: options.role,
      status: 'ACTIVE',
      stadiums: { create: stadiumIds.map((stadiumId) => ({ stadiumId })) },
    },
  });

  const response = await ctx
    .http()
    .post(api('/auth/login'))
    .send({ email, password: TEST_PASSWORD })
    .expect(200);

  return {
    id,
    email,
    role: options.role,
    stadiumIds,
    accessToken: (response.body as { tokens: { accessToken: string } }).tokens.accessToken,
  };
}

export async function seedStadium(
  ctx: TestContext,
  overrides: { code?: string; timezone?: string } = {},
): Promise<{ id: string; code: string; timezone: string }> {
  const id = uuidv7();
  const code = overrides.code ?? `T${id.slice(0, 5).toUpperCase()}`;
  const timezone = overrides.timezone ?? 'Asia/Qatar';

  await ctx.prisma.stadium.create({
    data: { id, name: `Test Stadium ${code}`, code, timezone, isActive: true },
  });
  return { id, code, timezone };
}

export async function seedTournament(ctx: TestContext): Promise<string> {
  const id = uuidv7();
  await ctx.prisma.tournament.create({
    data: {
      id,
      name: 'Test Tournament',
      startDate: new Date('2026-09-01T00:00:00Z'),
      endDate: new Date('2026-12-31T00:00:00Z'),
      isActive: true,
    },
  });
  return id;
}

export interface SeededChecklist {
  checklistId: string;
  versionId: string;
  items: { id: string; code: string }[];
}

export async function seedChecklist(
  ctx: TestContext,
  itemCount = 2,
): Promise<SeededChecklist> {
  const checklistId = uuidv7();
  const versionId = uuidv7();
  const items = Array.from({ length: itemCount }, (_, index) => ({
    id: uuidv7(),
    code: `TST-0${index + 1}`,
  }));

  await ctx.prisma.checklist.create({
    data: { id: checklistId, title: 'Test Checklist', isActive: true },
  });

  await ctx.prisma.checklistVersion.create({
    data: {
      id: versionId,
      checklistId,
      version: 1,
      isPublished: true,
      publishedAt: new Date(),
      itemCount,
      sections: {
        create: {
          id: uuidv7(),
          title: 'Test Section',
          sortOrder: 0,
          items: {
            create: items.map((item, index) => ({
              id: item.id,
              code: item.code,
              question: `Test question ${index + 1}?`,
              defaultSeverity: 'HIGH',
              allowNa: true,
              sortOrder: index,
            })),
          },
        },
      },
    },
  });

  await ctx.prisma.checklist.update({
    where: { id: checklistId },
    data: { currentVersionId: versionId },
  });

  return { checklistId, versionId, items };
}

/**
 * Evidence rows are normally created by a presigned upload. These tests are
 * about the rules around photos, not about object storage, so the row is
 * inserted as already uploaded.
 */
export async function seedUploadedEvidence(
  ctx: TestContext,
  options: { uploadedById: string; stadiumId: string },
): Promise<string> {
  const id = uuidv7();
  await ctx.prisma.evidence.create({
    data: {
      id,
      kind: 'PHOTO',
      context: 'INSPECTION_RESPONSE',
      objectKey: `test/${id}.jpg`,
      contentType: 'image/jpeg',
      sizeBytes: 2048,
      uploadStatus: 'UPLOADED',
      uploadedById: options.uploadedById,
      stadiumId: options.stadiumId,
    },
  });
  return id;
}

export async function seedEodWindow(
  ctx: TestContext,
  options: { stadiumId: string; date: string; startTime: string; endTime: string; enabled?: boolean },
): Promise<string> {
  const id = uuidv7();
  await ctx.prisma.eodWindow.create({
    data: {
      id,
      stadiumId: options.stadiumId,
      date: new Date(`${options.date}T00:00:00.000Z`),
      startTime: options.startTime,
      endTime: options.endTime,
      enabled: options.enabled ?? true,
    },
  });
  return id;
}

export function bearer(user: SeededUser): string {
  return `Bearer ${user.accessToken}`;
}
