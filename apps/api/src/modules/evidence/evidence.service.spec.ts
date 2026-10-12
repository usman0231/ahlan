import { ERROR_CODES } from '@ahlan/shared';

import { AppException } from '../../common/errors/app.exception';
import type { RequestUser } from '../../common/types/request-user';
import type { PrismaService } from '../../prisma/prisma.service';
import type { StorageService } from '../../storage/storage.service';
import { EvidenceService } from './evidence.service';

const STADIUM = '01930000-0000-7000-8000-000000000001';
const OTHER_STADIUM = '01930000-0000-7000-8000-000000000002';
const EVIDENCE = '01930000-0000-7000-8000-000000000041';

const inspector: RequestUser = {
  id: '01930000-0000-7000-8000-000000000031',
  email: 'inspector@example.test',
  fullName: 'Test Inspector',
  role: 'INSPECTOR',
  sessionId: '01930000-0000-7000-8000-00000000000c',
  stadiumIds: [STADIUM],
};
const supervisor: RequestUser = { ...inspector, role: 'SUPERVISOR' } as RequestUser;
const admin: RequestUser = { ...inspector, role: 'ADMIN', stadiumIds: [] };

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: EVIDENCE,
    kind: 'PHOTO',
    context: 'INSPECTION_RESPONSE',
    contextId: null,
    objectKey: `evidence/${STADIUM}/2026-10-10/${EVIDENCE}.jpg`,
    contentType: 'image/jpeg',
    sizeBytes: 1234,
    width: 100,
    height: 80,
    caption: null,
    checksum: null,
    capturedAt: new Date(),
    latitude: null,
    longitude: null,
    gpsAccuracyM: null,
    uploadStatus: 'PENDING',
    uploadedById: inspector.id,
    stadiumId: STADIUM,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function harness() {
  const prisma = {
    stadium: { findFirst: jest.fn().mockResolvedValue({ id: STADIUM, timezone: 'Asia/Qatar' }) },
    evidence: {
      findUnique: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      upsert: jest.fn(),
      update: jest.fn(async ({ data }: { data: Record<string, unknown> }) => row(data)),
    },
  };
  const storage = {
    buildEvidenceKey: jest.fn(() => 'evidence/key.jpg'),
    presignUpload: jest.fn(async () => ({
      uploadUrl: 'http://storage.test/put',
      objectKey: 'evidence/key.jpg',
      headers: { 'Content-Type': 'image/jpeg' },
      expiresAt: new Date(),
    })),
    presignDownload: jest.fn(async () => 'http://storage.test/get'),
    head: jest.fn(),
  };
  const service = new EvidenceService(
    prisma as unknown as PrismaService,
    storage as unknown as StorageService,
  );
  return { service, prisma, storage };
}

const presignInput = {
  id: EVIDENCE,
  kind: 'PHOTO' as const,
  context: 'INSPECTION_RESPONSE' as const,
  stadiumId: STADIUM,
  contentType: 'image/jpeg',
  sizeBytes: 1234,
};

async function caught(promise: Promise<unknown>): Promise<AppException> {
  try {
    await promise;
  } catch (error) {
    return error as AppException;
  }
  throw new Error('expected a rejection');
}

describe('EvidenceService.presign', () => {
  it('signs the exact byte length the device declared', async () => {
    const { service, prisma, storage } = harness();
    prisma.evidence.findUnique.mockResolvedValue(null);

    await service.presign(presignInput, inspector);

    expect(storage.presignUpload).toHaveBeenCalledWith(
      expect.objectContaining({ contentLength: 1234, contentType: 'image/jpeg' }),
    );
  });

  it('answers ALREADY_EXISTS with the object key when the photo is already uploaded', async () => {
    const { service, prisma, storage } = harness();
    prisma.evidence.findUnique.mockResolvedValue(row({ uploadStatus: 'UPLOADED' }));

    const error = await caught(service.presign(presignInput, inspector));

    expect(error).toBeInstanceOf(AppException);
    expect(error.code).toBe(ERROR_CODES.ALREADY_EXISTS);
    expect(error.details).toEqual(
      expect.objectContaining({ objectKey: row().objectKey, uploadStatus: 'UPLOADED' }),
    );
    expect(storage.presignUpload).not.toHaveBeenCalled();
  });

  it('refuses a supervisor, who never creates field evidence', async () => {
    const { service } = harness();
    const error = await caught(service.presign(presignInput, supervisor));
    expect(error.code).toBe(ERROR_CODES.FORBIDDEN);
  });
});

describe('EvidenceService.complete', () => {
  it('is idempotent: completing an uploaded photo again returns it without a HEAD', async () => {
    const { service, prisma, storage } = harness();
    prisma.evidence.findUnique.mockResolvedValue(row({ uploadStatus: 'UPLOADED' }));

    const result = await service.complete(EVIDENCE, {}, inspector);

    expect(result.uploadStatus).toBe('UPLOADED');
    expect(result.url).toBe('http://storage.test/get');
    expect(storage.head).not.toHaveBeenCalled();
    expect(prisma.evidence.update).not.toHaveBeenCalled();
  });

  it('marks the photo uploaded with the size storage reports', async () => {
    const { service, prisma, storage } = harness();
    prisma.evidence.findUnique.mockResolvedValue(row());
    storage.head.mockResolvedValue({ exists: true, sizeBytes: 999 });

    await service.complete(EVIDENCE, { sizeBytes: 1234 }, inspector);

    expect(prisma.evidence.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ uploadStatus: 'UPLOADED', sizeBytes: 999 }) }),
    );
  });

  it('flags a missing object as FAILED with a CONFLICT the device retries', async () => {
    const { service, prisma, storage } = harness();
    prisma.evidence.findUnique.mockResolvedValue(row());
    storage.head.mockResolvedValue({ exists: false });

    const error = await caught(service.complete(EVIDENCE, {}, inspector));

    expect(error.code).toBe(ERROR_CODES.CONFLICT);
    expect(prisma.evidence.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { uploadStatus: 'FAILED' } }),
    );
  });

  it('does not blame the device when storage itself is down', async () => {
    const { service, prisma, storage } = harness();
    prisma.evidence.findUnique.mockResolvedValue(row());
    storage.head.mockRejectedValue(new Error('503'));

    const error = await caught(service.complete(EVIDENCE, {}, inspector));

    expect(error.code).toBe(ERROR_CODES.INTERNAL_ERROR);
    expect(error.getStatus()).toBe(502);
    expect(prisma.evidence.update).not.toHaveBeenCalled();
  });
});

describe('EvidenceService.listFor', () => {
  it.each([
    ['INSPECTOR', inspector],
    ['SUPERVISOR', supervisor],
  ])('scopes %s to assigned stadiums', async (_role, actor) => {
    const { service, prisma } = harness();
    await service.listFor('OBSERVATION', EVIDENCE, actor);
    expect(prisma.evidence.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ stadiumId: { in: [STADIUM] } }),
      }),
    );
  });

  it('does not scope an admin', async () => {
    const { service, prisma } = harness();
    await service.listFor('OBSERVATION', EVIDENCE, admin);
    const where = prisma.evidence.findMany.mock.calls[0][0].where;
    expect(where.stadiumId).toBeUndefined();
  });

  it('refuses to read a photo from a stadium outside the assignment', async () => {
    const { service, prisma } = harness();
    prisma.evidence.findUnique.mockResolvedValue(row({ stadiumId: OTHER_STADIUM }));
    const error = await caught(service.get(EVIDENCE, inspector));
    expect(error.code).toBe(ERROR_CODES.STADIUM_OUT_OF_SCOPE);
  });
});
