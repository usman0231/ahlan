import { ERROR_CODES, submitEodSchema, type EodWindowCheck } from '@ahlan/shared';

import { AppException } from '../../common/errors/app.exception';
import { EodService } from './eod.service';
import type { EodWindowsService } from './eod-windows.service';
import type { PrismaService } from '../../prisma/prisma.service';
import type { AuditService } from '../audit/audit.service';
import type { EvidenceService } from '../evidence/evidence.service';
import type { RequestUser } from '../../common/types/request-user';

const STADIUM = '01930000-0000-7000-8000-000000000001';
const REPORT = '01930000-0000-7000-8000-000000000021';

const inspector: RequestUser = {
  id: '01930000-0000-7000-8000-00000000000a',
  email: 'inspector@example.test',
  fullName: 'Test Inspector',
  role: 'INSPECTOR',
  sessionId: '01930000-0000-7000-8000-00000000000b',
  stadiumIds: [STADIUM],
};

const supervisor: RequestUser = { ...inspector, role: 'SUPERVISOR' };

const OPEN: EodWindowCheck = {
  open: true,
  bounds: { opensAt: new Date(), closesAt: new Date(), crossesMidnight: false },
};

function harness(check: EodWindowCheck = OPEN) {
  const tx = {
    eodReport: { upsert: jest.fn(), update: jest.fn() },
    eodWorkforceEntry: { deleteMany: jest.fn(), createMany: jest.fn() },
  };
  const findEod = jest.fn().mockResolvedValue(null);
  const prisma = {
    stadium: { findFirst: jest.fn().mockResolvedValue({ timezone: 'Asia/Riyadh' }) },
    tournament: { findFirst: jest.fn().mockResolvedValue({ id: 'tournament-1' }) },
    eodReport: {
      findUnique: findEod,
      // Reads by id go through findFirst (soft-delete aware); mirror findUnique.
      findFirst: jest.fn((args: unknown): unknown => findEod(args)),
      // No soft-deleted rows in these scenarios.
      count: jest.fn().mockResolvedValue(0),
    },
    inspection: { count: jest.fn().mockResolvedValue(2) },
    observation: { count: jest.fn().mockResolvedValue(1) },
    finding: { count: jest.fn().mockResolvedValue(0) },
    $transaction: jest.fn(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx)),
  };
  const windows = { checkSubmission: jest.fn().mockResolvedValue(check) };
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const evidence = { attach: jest.fn().mockResolvedValue(undefined) };

  const service = new EodService(
    prisma as unknown as PrismaService,
    windows as unknown as EodWindowsService,
    audit as unknown as AuditService,
    evidence as unknown as EvidenceService,
  );
  jest
    .spyOn(service, 'get')
    .mockResolvedValue({ id: REPORT } as unknown as Awaited<ReturnType<typeof service.get>>);
  return { service, prisma, tx, windows, audit };
}

/** A local date in Riyadh, days from today. */
function riyadhDate(offsetDays = 0): string {
  const now = new Date(Date.now() + 3 * 3_600_000 + offsetDays * 86_400_000);
  return now.toISOString().slice(0, 10);
}

function payload(overrides: Record<string, unknown> = {}) {
  return submitEodSchema.parse({
    id: REPORT,
    stadiumId: STADIUM,
    date: riyadhDate(),
    clientCreatedAt: new Date().toISOString(),
    submittedAt: new Date().toISOString(),
    summary: 'Highlights and key activities of the day.',
    workforce: [
      { category: 'Stewards', personnel: 40, hours: '8.50', manHours: '9999.00' },
      { category: 'Volunteers', personnel: 3, hours: '0.33' },
    ],
    workRelatedMedical: 2,
    recordableIncidents: 7,
    firstAidCases: 4,
    totalSpectators: 25_000,
    ...overrides,
  });
}

describe('EodService.submit', () => {
  it('recomputes man-hours from personnel x hours and ignores the device total', async () => {
    const { service, tx } = harness();
    await service.submit(payload(), inspector);

    const rows = tx.eodWorkforceEntry.createMany.mock.calls[0][0].data;
    expect(rows.map((row: { manHours: { toFixed(n: number): string } }) => row.manHours.toFixed(2))).toEqual([
      '340.00',
      '0.99',
    ]);
    expect(rows[0]).toMatchObject({ category: 'Stewards', personnel: 40 });

    const data = tx.eodReport.upsert.mock.calls[0][0].create;
    expect(data.totalHeadcount).toBe(43);
    expect(data.totalManHours.toFixed(2)).toBe('340.99');
  });

  it('stores recordableIncidents = workRelatedMedical and the new statistics', async () => {
    const { service, tx } = harness();
    await service.submit(payload(), inspector);
    const data = tx.eodReport.upsert.mock.calls[0][0].create;
    expect(data).toMatchObject({
      workRelatedMedical: 2,
      recordableIncidents: 2,
      firstAidCases: 4,
      fireIncidents: 0,
      totalSpectators: 25_000,
      status: 'SUBMITTED',
      isLocked: true,
    });
  });

  it('accepts a legacy workforce line and a legacy recordableIncidents', async () => {
    const { service, tx } = harness();
    await service.submit(
      payload({
        workforce: [{ contractor: 'Alpha', headcount: 24, manHours: '192.00' }],
        workRelatedMedical: undefined,
        recordableIncidents: 1,
      }),
      inspector,
    );
    const rows = tx.eodWorkforceEntry.createMany.mock.calls[0][0].data;
    expect(rows[0]).toMatchObject({ category: 'Alpha', personnel: 24 });
    expect(rows[0].hours.toFixed(2)).toBe('8.00');
    expect(rows[0].manHours.toFixed(2)).toBe('192.00');
    const data = tx.eodReport.upsert.mock.calls[0][0].create;
    expect(data).toMatchObject({ workRelatedMedical: 1, recordableIncidents: 1 });
  });

  it('accepts yesterday but rejects older report dates', async () => {
    const { service } = harness();
    await expect(service.submit(payload({ date: riyadhDate(-1) }), inspector)).resolves.toBeDefined();

    const second = harness();
    await expect(second.service.submit(payload({ date: riyadhDate(-2) }), inspector)).rejects.toMatchObject({
      code: ERROR_CODES.EOD_DATE_NOT_ALLOWED,
    });
    await expect(second.service.submit(payload({ date: riyadhDate(1) }), inspector)).rejects.toMatchObject({
      code: ERROR_CODES.EOD_DATE_NOT_ALLOWED,
    });
  });

  it('rejects outside the window, judged at the moment of submission', async () => {
    const { service, windows } = harness({
      open: false,
      code: ERROR_CODES.EOD_WINDOW_CLOSED,
      message: 'The EOD submission window has closed.',
    });
    await expect(service.submit(payload(), inspector)).rejects.toMatchObject({
      code: ERROR_CODES.EOD_WINDOW_CLOSED,
    });
    expect(windows.checkSubmission).toHaveBeenCalledWith(STADIUM, expect.any(Date));
  });

  it('refuses a supervisor and an out-of-scope stadium', async () => {
    const { service } = harness();
    await expect(service.submit(payload(), supervisor)).rejects.toBeInstanceOf(AppException);
    await expect(
      service.submit(payload(), { ...inspector, stadiumIds: [] }),
    ).rejects.toMatchObject({ code: ERROR_CODES.STADIUM_OUT_OF_SCOPE });
  });
});

describe('EodService.correct', () => {
  it('recomputes totals from corrected workforce and mirrors the medical count', async () => {
    const { service, prisma, tx, audit } = harness();
    (prisma.eodReport as unknown as { findUnique: jest.Mock }).findUnique.mockResolvedValue({
      id: REPORT,
      stadiumId: STADIUM,
      totalHeadcount: 1,
      totalManHours: { toFixed: () => '8.00' },
      workRelatedMedical: 0,
      recordableIncidents: 0,
      workforce: [],
    });

    await service.correct(
      REPORT,
      {
        reason: 'Steward numbers were under-reported',
        workforce: [{ category: 'Stewards', personnel: 10, hours: '12.00' }],
        workRelatedMedical: 1,
      },
      { ...inspector, role: 'ADMIN', stadiumIds: [] },
    );

    const data = tx.eodReport.update.mock.calls[0][0].data;
    expect(data.totalHeadcount).toBe(10);
    expect(data.totalManHours.toFixed(2)).toBe('120.00');
    expect(data).toMatchObject({ workRelatedMedical: 1, recordableIncidents: 1 });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'ADMIN_CORRECTION' }),
      tx,
    );
  });
});
