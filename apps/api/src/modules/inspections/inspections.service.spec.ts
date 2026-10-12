import { ERROR_CODES } from '@ahlan/shared';

import { AppException } from '../../common/errors/app.exception';
import { InspectionsService } from './inspections.service';
import type { PrismaService } from '../../prisma/prisma.service';
import type { AuditService } from '../audit/audit.service';
import type { EvidenceService } from '../evidence/evidence.service';
import type { FindingsService } from '../findings/findings.service';
import type { RequestUser } from '../../common/types/request-user';

const STADIUM = '01930000-0000-7000-8000-000000000001';
const OTHER_STADIUM = '01930000-0000-7000-8000-000000000002';
const CHECKLIST = '01930000-0000-7000-8000-000000000011';
const VERSION = '01930000-0000-7000-8000-000000000012';
const INSPECTION = '01930000-0000-7000-8000-000000000021';
const PHOTO = '01930000-0000-7000-8000-0000000000e1';

const ITEMS = [
  { id: '01930000-0000-7000-8000-000000000101', code: 'WAH-01', question: 'Ladders secured?', defaultSeverity: 'HIGH', allowNa: true },
  { id: '01930000-0000-7000-8000-000000000102', code: 'WAH-02', question: 'Guardrails fitted?', defaultSeverity: 'CRITICAL', allowNa: true },
  { id: '01930000-0000-7000-8000-000000000103', code: 'WAH-03', question: 'Harness worn?', defaultSeverity: 'CRITICAL', allowNa: false },
];

const inspector: RequestUser = {
  id: '01930000-0000-7000-8000-00000000000a',
  email: 'inspector@example.test',
  fullName: 'Test Inspector',
  role: 'INSPECTOR',
  sessionId: '01930000-0000-7000-8000-00000000000b',
  stadiumIds: [STADIUM],
};

function harness() {
  const tx = {
    inspection: { upsert: jest.fn(), update: jest.fn() },
    inspectionResponse: { deleteMany: jest.fn(), createMany: jest.fn(), update: jest.fn() },
    auditLog: { create: jest.fn() },
  };

  const findInspection = jest.fn().mockResolvedValue(null);
  const prisma = {
    inspection: {
      findUnique: findInspection,
      findMany: jest.fn(),
      // Reads by id go through findFirst (soft-delete aware); mirror findUnique.
      findFirst: jest.fn((args: unknown): unknown => findInspection(args)),
      // No soft-deleted rows in these scenarios.
      count: jest.fn().mockResolvedValue(0),
    },
    stadium: {
      findFirst: jest.fn().mockResolvedValue({ timezone: 'Asia/Qatar', code: 'LSL' }),
    },
    checklistVersion: {
      findUnique: jest.fn().mockResolvedValue({ checklist: { disciplineId: null } }),
    },
    tournament: { findFirst: jest.fn().mockResolvedValue({ id: 'tournament-1' }) },
    checklistSection: {
      findMany: jest.fn().mockResolvedValue([{ id: 'section-1', items: ITEMS }]),
    },
    evidence: { findMany: jest.fn().mockResolvedValue([]) },
    finding: { count: jest.fn().mockResolvedValue(0) },
    $transaction: jest.fn(async (callback: (client: typeof tx) => Promise<unknown>) =>
      callback(tx),
    ),
  };

  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const evidence = {
    attach: jest.fn().mockResolvedValue(undefined),
    hydrateMany: jest.fn().mockResolvedValue([]),
  };
  const findings = { raiseFromInspectionResponse: jest.fn().mockResolvedValue('finding-1') };

  const service = new InspectionsService(
    prisma as unknown as PrismaService,
    audit as unknown as AuditService,
    evidence as unknown as EvidenceService,
    findings as unknown as FindingsService,
  );

  // `submit` re-reads the record through `get`; the read path has its own tests.
  jest
    .spyOn(service, 'get')
    .mockResolvedValue({ id: INSPECTION } as unknown as Awaited<ReturnType<typeof service.get>>);

  return { service, prisma, tx, audit, evidence, findings };
}

function payload(overrides: Record<string, unknown> = {}) {
  return {
    id: INSPECTION,
    stadiumId: STADIUM,
    checklistId: CHECKLIST,
    checklistVersionId: VERSION,
    startedAt: new Date('2026-10-06T06:00:00Z'),
    submittedAt: new Date('2026-10-06T07:00:00Z'),
    clientCreatedAt: new Date('2026-10-06T06:00:00Z'),
    gps: { latitude: 25.3, longitude: 51.5, accuracyM: 8 },
    deviceId: 'test-device',
    appVersion: '0.1.0',
    notes: null,
    responses: ITEMS.map((item) => ({
      id: `response-${item.code}`,
      itemId: item.id,
      value: 'YES' as const,
      comment: null,
      severity: null,
      evidenceIds: [] as string[],
      answeredAt: new Date('2026-10-06T06:30:00Z'),
    })),
    ...overrides,
  } as Parameters<InspectionsService['submit']>[0];
}

describe('submitting an inspection', () => {
  it('stores the answers, locks the record and recomputes compliance', async () => {
    const { service, tx } = harness();

    await service.submit(payload(), inspector);

    const data = tx.inspection.upsert.mock.calls[0]?.[0]?.create as Record<string, unknown>;
    expect(data.status).toBe('SUBMITTED');
    expect(data.isLocked).toBe(true);
    expect(data.yesCount).toBe(3);
    expect(data.noCount).toBe(0);
    expect(String(data.compliancePercent)).toBe('100');
    expect(data.serverReceivedAt).toBeInstanceOf(Date);
    expect(tx.inspectionResponse.createMany).toHaveBeenCalled();
  });

  it('computes YES / (YES + NO) with NA excluded', async () => {
    const { service, tx } = harness();
    const responses = payload().responses.map((response, index) => ({
      ...response,
      value: index === 0 ? ('NO' as const) : index === 1 ? ('NA' as const) : ('YES' as const),
      evidenceIds: index === 0 ? [PHOTO] : [],
    }));

    await service.submit(payload({ responses }), inspector);

    const data = tx.inspection.upsert.mock.calls[0]?.[0]?.create as Record<string, unknown>;
    // 1 YES, 1 NO, 1 NA -> 50.00
    expect(data.yesCount).toBe(1);
    expect(data.noCount).toBe(1);
    expect(data.naCount).toBe(1);
    expect(String(data.compliancePercent)).toBe('50');
  });

  it('rejects a NO without a photo', async () => {
    const { service } = harness();
    const responses = payload().responses.map((response, index) =>
      index === 0 ? { ...response, value: 'NO' as const, evidenceIds: [] } : response,
    );

    await expect(service.submit(payload({ responses }), inspector)).rejects.toMatchObject({
      code: ERROR_CODES.EVIDENCE_REQUIRED,
    });
  });

  it('raises exactly one finding per NO', async () => {
    const { service, findings } = harness();
    const responses = payload().responses.map((response, index) =>
      index < 2
        ? { ...response, value: 'NO' as const, evidenceIds: [PHOTO] }
        : response,
    );

    await service.submit(payload({ responses }), inspector);

    expect(findings.raiseFromInspectionResponse).toHaveBeenCalledTimes(2);
    const first = findings.raiseFromInspectionResponse.mock.calls[0]?.[1] as Record<string, unknown>;
    // The item default carries through when the inspector did not override it.
    expect(first.severity).toBe('HIGH');
    expect(first.itemCode).toBe('WAH-01');
  });

  it("lets the inspector raise a finding's severity above the item default", async () => {
    const { service, findings } = harness();
    const responses = payload().responses.map((response, index) =>
      index === 0
        ? { ...response, value: 'NO' as const, severity: 'CRITICAL' as const, evidenceIds: [PHOTO] }
        : response,
    );

    await service.submit(payload({ responses }), inspector);

    const raised = findings.raiseFromInspectionResponse.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(raised.severity).toBe('CRITICAL');
  });

  it('refuses an incomplete checklist', async () => {
    const { service } = harness();
    const responses = payload().responses.slice(0, 2);

    await expect(service.submit(payload({ responses }), inspector)).rejects.toMatchObject({
      code: ERROR_CODES.INCOMPLETE_CHECKLIST,
    });
  });

  it('refuses NA on an item that does not allow it', async () => {
    const { service } = harness();
    const responses = payload().responses.map((response, index) =>
      // WAH-03 has allowNa: false
      index === 2 ? { ...response, value: 'NA' as const } : response,
    );

    await expect(service.submit(payload({ responses }), inspector)).rejects.toThrow(AppException);
  });

  it('refuses answers that belong to another checklist version', async () => {
    const { service } = harness();
    const responses = payload().responses.map((response, index) =>
      index === 0 ? { ...response, itemId: '01930000-0000-7000-8000-0000000009ff' } : response,
    );

    await expect(service.submit(payload({ responses }), inspector)).rejects.toMatchObject({
      code: ERROR_CODES.CHECKLIST_VERSION_MISMATCH,
    });
  });

  it('refuses the same item answered twice', async () => {
    const { service } = harness();
    const base = payload().responses;
    const responses = [...base, { ...base[0]!, id: 'response-duplicate' }];

    await expect(service.submit(payload({ responses }), inspector)).rejects.toThrow(AppException);
  });

  it('is idempotent: a retried submit returns the stored copy untouched', async () => {
    const { service, prisma, tx } = harness();
    prisma.inspection.findUnique.mockResolvedValue({
      id: INSPECTION,
      status: 'SUBMITTED',
      inspectorId: inspector.id,
    });

    await service.submit(payload(), inspector);

    // Nothing written: the first submit already landed.
    expect(tx.inspection.upsert).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("refuses to submit another inspector's draft", async () => {
    const { service, prisma } = harness();
    prisma.inspection.findUnique.mockResolvedValue({
      id: INSPECTION,
      status: 'DRAFT',
      inspectorId: '01930000-0000-7000-8000-00000000ffff',
    });

    await expect(service.submit(payload(), inspector)).rejects.toMatchObject({
      code: ERROR_CODES.FORBIDDEN,
    });
  });

  it('fails when the stadium does not exist', async () => {
    const { service, prisma } = harness();
    prisma.stadium.findFirst.mockResolvedValue(null);

    await expect(service.submit(payload(), inspector)).rejects.toMatchObject({
      code: ERROR_CODES.NOT_FOUND,
    });
  });

  it('records the submission in the audit trail', async () => {
    const { service, audit, tx } = harness();

    await service.submit(payload(), inspector);

    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'SUBMIT',
        entity: 'inspections',
        entityId: INSPECTION,
        stadiumId: STADIUM,
      }),
      tx,
    );
  });

  it('stamps the stadium-local date, not the device date', async () => {
    const { service, tx } = harness();

    // 22:30Z on the 5th is already the 6th in Asia/Qatar (UTC+3).
    await service.submit(
      payload({ submittedAt: new Date('2026-10-05T22:30:00Z') }),
      inspector,
    );

    const data = tx.inspection.upsert.mock.calls[0]?.[0]?.create as Record<string, unknown>;
    expect((data.localDate as Date).toISOString().slice(0, 10)).toBe('2026-10-06');
  });
});

describe('reading an inspection', () => {
  it('refuses an inspector a stadium outside their scope', async () => {
    const { service, prisma } = harness();
    jest.restoreAllMocks();
    prisma.inspection.findUnique.mockResolvedValue({
      id: INSPECTION,
      stadiumId: OTHER_STADIUM,
      responses: [],
    });

    await expect(service.get(INSPECTION, inspector)).rejects.toMatchObject({
      code: ERROR_CODES.STADIUM_OUT_OF_SCOPE,
    });
  });
});

describe('saving a draft', () => {
  it('refuses to touch a submitted inspection', async () => {
    const { service, prisma } = harness();
    prisma.inspection.findUnique.mockResolvedValue({
      id: INSPECTION,
      stadiumId: STADIUM,
      status: 'SUBMITTED',
      inspectorId: inspector.id,
      checklistVersionId: VERSION,
    });

    await expect(
      service.saveDraft(INSPECTION, { responses: [], notes: null }, inspector),
    ).rejects.toMatchObject({ code: ERROR_CODES.RECORD_LOCKED });
  });
});

describe('field-entry permissions', () => {
  const supervisor: RequestUser = { ...inspector, role: 'SUPERVISOR' };

  it('refuses a supervisor submitting, online or via /sync/push', async () => {
    const { service, tx } = harness();
    await expect(service.submit(payload(), supervisor)).rejects.toMatchObject({
      code: ERROR_CODES.FORBIDDEN,
    });
    expect(tx.inspection.upsert).not.toHaveBeenCalled();
  });

  it('refuses a supervisor starting an inspection', async () => {
    const { service } = harness();
    await expect(
      service.create(
        {
          id: INSPECTION,
          stadiumId: STADIUM,
          checklistId: CHECKLIST,
          checklistVersionId: VERSION,
          startedAt: '2026-10-06T06:00:00.000Z',
          clientCreatedAt: '2026-10-06T06:00:00.000Z',
        } as never,
        supervisor,
      ),
    ).rejects.toMatchObject({ code: ERROR_CODES.FORBIDDEN });
  });

  it('refuses an inspector submitting for a stadium outside their scope', async () => {
    const { service, tx } = harness();
    await expect(
      service.submit(payload({ stadiumId: OTHER_STADIUM }), inspector),
    ).rejects.toMatchObject({ code: ERROR_CODES.STADIUM_OUT_OF_SCOPE });
    expect(tx.inspection.upsert).not.toHaveBeenCalled();
  });
});
