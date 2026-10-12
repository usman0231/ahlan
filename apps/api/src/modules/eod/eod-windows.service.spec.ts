import { ERROR_CODES } from '@ahlan/shared';

import { AppException } from '../../common/errors/app.exception';
import { EodWindowsService } from './eod-windows.service';
import type { PrismaService } from '../../prisma/prisma.service';
import type { AuditService } from '../audit/audit.service';
import type { RequestUser } from '../../common/types/request-user';

const STADIUM = '01930000-0000-7000-8000-000000000001';
const RIYADH = 'Asia/Riyadh'; // UTC+3, no DST

const admin: RequestUser = {
  id: '01930000-0000-7000-8000-00000000000a',
  email: 'admin@example.test',
  fullName: 'Test Admin',
  role: 'ADMIN',
  sessionId: '01930000-0000-7000-8000-00000000000b',
  stadiumIds: [],
};

interface Harness {
  service: EodWindowsService;
  prisma: {
    stadium: { findFirst: jest.Mock };
    eodWindow: {
      findFirst: jest.Mock;
      findMany: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
      findUnique: jest.Mock;
    };
    eodReport: { findFirst: jest.Mock };
    eodWindowDefault: {
      findMany: jest.Mock;
      findFirst: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
  };
  audit: { record: jest.Mock };
}

function harness(): Harness {
  const prisma = {
    stadium: { findFirst: jest.fn().mockResolvedValue({ timezone: RIYADH }) },
    eodWindow: {
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      findUnique: jest.fn(),
    },
    eodReport: { findFirst: jest.fn().mockResolvedValue(null) },
    eodWindowDefault: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn(),
      update: jest.fn(),
    },
  };
  const audit = { record: jest.fn().mockResolvedValue(undefined) };

  return {
    prisma,
    audit,
    service: new EodWindowsService(
      prisma as unknown as PrismaService,
      audit as unknown as AuditService,
    ),
  };
}

function windowRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: '01930000-0000-7000-8000-0000000000ff',
    stadiumId: STADIUM,
    date: new Date('2026-10-06T00:00:00.000Z'),
    startTime: '18:00',
    endTime: '23:00',
    enabled: true,
    createdById: admin.id,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function defaultRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: '01930000-0000-7000-8000-0000000000ee',
    stadiumId: null,
    startTime: '18:00',
    endTime: '23:00',
    enabled: true,
    updatedById: admin.id,
    createdAt: new Date(),
    updatedAt: new Date('2026-10-01T00:00:00Z'),
    ...overrides,
  };
}

describe('EodWindowsService.resolve', () => {
  it('prefers a stadium-specific window over the global one', async () => {
    const { service, prisma } = harness();
    prisma.eodWindow.findMany.mockResolvedValue([
      windowRow({ stadiumId: null, startTime: '17:00' }),
      windowRow(),
    ]);

    const resolved = await service.resolve(STADIUM, '2026-10-06');

    expect(resolved.window?.stadiumId).toBe(STADIUM);
    expect(resolved.window?.startTime).toBe('18:00');
    expect(resolved.timezone).toBe(RIYADH);
  });

  it('falls back to the global window', async () => {
    const { service, prisma } = harness();
    prisma.eodWindow.findMany.mockResolvedValue([windowRow({ stadiumId: null })]);

    const resolved = await service.resolve(STADIUM, '2026-10-06');
    expect(resolved.window?.stadiumId).toBeNull();
  });

  it('uses a per-date row before any recurring default', async () => {
    const { service, prisma } = harness();
    prisma.eodWindow.findMany.mockResolvedValue([windowRow({ stadiumId: null, startTime: '16:00' })]);
    prisma.eodWindowDefault.findMany.mockResolvedValue([
      defaultRow({ stadiumId: STADIUM, startTime: '19:00' }),
      defaultRow({ stadiumId: null, startTime: '20:00' }),
    ]);

    const resolved = await service.resolve(STADIUM, '2026-10-06');
    expect(resolved.window?.startTime).toBe('16:00');
  });

  it('falls back to the stadium default, then the global default', async () => {
    const { service, prisma } = harness();
    prisma.eodWindowDefault.findMany.mockResolvedValue([
      defaultRow({ stadiumId: null, startTime: '20:00' }),
      defaultRow({ stadiumId: STADIUM, startTime: '19:00' }),
    ]);
    expect((await service.resolve(STADIUM, '2026-10-06')).window).toMatchObject({
      date: '2026-10-06',
      startTime: '19:00',
      stadiumId: STADIUM,
    });

    prisma.eodWindowDefault.findMany.mockResolvedValue([defaultRow({ stadiumId: null, startTime: '20:00' })]);
    expect((await service.resolve(STADIUM, '2026-10-06')).window).toMatchObject({
      startTime: '20:00',
      stadiumId: null,
    });
  });

  it('fails when the stadium does not exist', async () => {
    const { service, prisma } = harness();
    prisma.stadium.findFirst.mockResolvedValue(null);
    await expect(service.resolve(STADIUM, '2026-10-06')).rejects.toThrow(AppException);
  });
});

describe('EodWindowsService.status', () => {
  const inside = new Date('2026-10-06T19:00:00Z'); // 22:00 in Riyadh

  it('reports the window open inside its bounds', async () => {
    const { service, prisma } = harness();
    prisma.eodWindow.findMany.mockResolvedValue([windowRow()]);

    const status = await service.status(STADIUM, '2026-10-06', admin, inside);

    expect(status.open).toBe(true);
    expect(status.reason).toBeNull();
    expect(status.closesAt?.toISOString()).toBe('2026-10-06T20:00:00.000Z');
    expect(status.alreadySubmitted).toBe(false);
  });

  it('reports closed before the window opens', async () => {
    const { service, prisma } = harness();
    prisma.eodWindow.findMany.mockResolvedValue([windowRow()]);

    const status = await service.status(
      STADIUM,
      '2026-10-06',
      admin,
      new Date('2026-10-06T10:00:00Z'),
    );
    expect(status.open).toBe(false);
    expect(status.reason).toMatch(/not opened/i);
  });

  it('reports closed when the admin disabled the window', async () => {
    const { service, prisma } = harness();
    prisma.eodWindow.findMany.mockResolvedValue([windowRow({ enabled: false })]);

    const status = await service.status(STADIUM, '2026-10-06', admin, inside);
    expect(status.open).toBe(false);
    expect(status.reason).toMatch(/disabled/i);
  });

  it('reports closed when no window exists for the date', async () => {
    const { service } = harness();
    const status = await service.status(STADIUM, '2026-10-06', admin, inside);
    expect(status.open).toBe(false);
    expect(status.reason).toMatch(/no eod submission window/i);
  });

  it('flags an already-submitted report', async () => {
    const { service, prisma } = harness();
    prisma.eodWindow.findMany.mockResolvedValue([windowRow()]);
    prisma.eodReport.findFirst.mockResolvedValue({ id: 'existing' });

    const status = await service.status(STADIUM, '2026-10-06', admin, inside);
    expect(status.alreadySubmitted).toBe(true);
  });

  it('resolves the window in the stadium zone, not the server zone', async () => {
    const { service, prisma } = harness();
    prisma.stadium.findFirst.mockResolvedValue({ timezone: 'UTC' });
    prisma.eodWindow.findMany.mockResolvedValue([windowRow()]);

    // 18:00 UTC opens three hours later than 18:00 in Riyadh.
    const status = await service.status(STADIUM, '2026-10-06', admin, inside);
    expect(status.open).toBe(true);
    expect(status.opensAt?.toISOString()).toBe('2026-10-06T18:00:00.000Z');
  });
});

describe('EodWindowsService.check', () => {
  it('returns the shared error code when the window is shut', () => {
    const { service } = harness();
    const result = service.check(null, RIYADH);
    expect(result.open).toBe(false);
    if (!result.open) expect(result.code).toBe(ERROR_CODES.EOD_WINDOW_CLOSED);
  });
});

describe('EodWindowsService.upsert', () => {
  it('creates a window and records it in the audit trail', async () => {
    const { service, prisma, audit } = harness();
    prisma.eodWindow.create.mockResolvedValue(windowRow());

    await service.upsert(
      { stadiumId: STADIUM, date: '2026-10-06', startTime: '18:00', endTime: '23:00', enabled: true },
      admin,
    );

    expect(prisma.eodWindow.create).toHaveBeenCalled();
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'CREATE', entity: 'eod_windows' }),
    );
  });

  it('updates the existing row rather than creating a duplicate', async () => {
    const { service, prisma } = harness();
    prisma.eodWindow.findFirst.mockResolvedValue(windowRow());
    prisma.eodWindow.update.mockResolvedValue(windowRow({ endTime: '23:30' }));

    await service.upsert(
      { stadiumId: STADIUM, date: '2026-10-06', startTime: '18:00', endTime: '23:30', enabled: true },
      admin,
    );

    expect(prisma.eodWindow.update).toHaveBeenCalled();
    expect(prisma.eodWindow.create).not.toHaveBeenCalled();
  });

  it('rejects a window for a stadium that does not exist', async () => {
    const { service, prisma } = harness();
    prisma.stadium.findFirst.mockResolvedValue(null);

    await expect(
      service.upsert(
        { stadiumId: STADIUM, date: '2026-10-06', startTime: '18:00', endTime: '23:00', enabled: true },
        admin,
      ),
    ).rejects.toThrow(AppException);
  });
});

describe('EodWindowsService.bulkUpsert', () => {
  it('writes one window per stadium per day in the range', async () => {
    const { service, prisma } = harness();
    prisma.eodWindow.create.mockResolvedValue(windowRow());

    const result = await service.bulkUpsert(
      {
        stadiumIds: [STADIUM, '01930000-0000-7000-8000-000000000002'],
        from: '2026-10-06',
        to: '2026-10-08',
        startTime: '18:00',
        endTime: '23:00',
        enabled: true,
      },
      admin,
    );

    // 2 stadiums x 3 days
    expect(result.written).toBe(6);
  });

  it('writes a single global window per day when no stadium is given', async () => {
    const { service, prisma } = harness();
    prisma.eodWindow.create.mockResolvedValue(windowRow({ stadiumId: null }));

    const result = await service.bulkUpsert(
      {
        stadiumIds: [],
        from: '2026-10-06',
        to: '2026-10-07',
        startTime: '18:00',
        endTime: '23:00',
        enabled: true,
      },
      admin,
    );

    expect(result.written).toBe(2);
  });
});

describe('EodWindowsService.checkSubmission', () => {
  it('is open from the global default with no per-date rows', async () => {
    const { service, prisma } = harness();
    prisma.eodWindowDefault.findMany.mockResolvedValue([defaultRow()]);
    const check = await service.checkSubmission(STADIUM, new Date('2026-10-06T16:00:00Z'));
    expect(check.open).toBe(true);
  });

  it('honours a per-date row that disables the day', async () => {
    const { service, prisma } = harness();
    prisma.eodWindow.findMany.mockResolvedValue([windowRow({ stadiumId: null, enabled: false })]);
    prisma.eodWindowDefault.findMany.mockResolvedValue([defaultRow()]);
    const check = await service.checkSubmission(STADIUM, new Date('2026-10-06T16:00:00Z'));
    expect(check.open).toBe(false);
  });

  it('stays open after midnight inside the previous day window', async () => {
    const { service, prisma } = harness();
    prisma.eodWindowDefault.findMany.mockResolvedValue([
      defaultRow({ startTime: '21:00', endTime: '02:00' }),
    ]);
    // 01:00 Riyadh on 7 Oct
    const check = await service.checkSubmission(STADIUM, new Date('2026-10-06T22:00:00Z'));
    expect(check.open).toBe(true);
  });
});

describe('EodWindowsService default', () => {
  it('returns the global default with an OPEN status computed in Riyadh', async () => {
    const { service, prisma } = harness();
    prisma.eodWindowDefault.findMany.mockResolvedValue([defaultRow()]);
    const status = await service.getDefault(undefined, new Date('2026-10-06T16:00:00Z'));
    expect(status).toMatchObject({
      stadiumId: null,
      startTime: '18:00',
      endTime: '23:00',
      enabled: true,
      status: 'OPEN',
      timezone: RIYADH,
    });
    expect(status.closesAt?.toISOString()).toBe('2026-10-06T20:00:00.000Z');
  });

  it('reports CLOSED outside and DISABLED when switched off or missing', async () => {
    const { service, prisma } = harness();
    prisma.eodWindowDefault.findMany.mockResolvedValue([defaultRow()]);
    expect((await service.getDefault(undefined, new Date('2026-10-06T09:00:00Z'))).status).toBe('CLOSED');

    prisma.eodWindowDefault.findMany.mockResolvedValue([defaultRow({ enabled: false })]);
    expect((await service.getDefault()).status).toBe('DISABLED');

    prisma.eodWindowDefault.findMany.mockResolvedValue([]);
    const missing = await service.getDefault();
    expect(missing).toMatchObject({ status: 'DISABLED', enabled: false, updatedAt: null });
  });

  it('prefers the stadium default for a stadium', async () => {
    const { service, prisma } = harness();
    prisma.eodWindowDefault.findMany.mockResolvedValue([
      defaultRow(),
      defaultRow({ stadiumId: STADIUM, startTime: '19:30' }),
    ]);
    expect((await service.getDefault(STADIUM)).startTime).toBe('19:30');
  });

  it('creates the global default once, then updates it, auditing both', async () => {
    const { service, prisma, audit } = harness();
    prisma.eodWindowDefault.create.mockResolvedValue(defaultRow());
    await service.upsertDefault({ startTime: '18:00', endTime: '23:00', enabled: true }, admin);
    expect(prisma.eodWindowDefault.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ stadiumId: null, updatedById: admin.id }),
    });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'CREATE', entity: 'eod_window_defaults' }),
    );

    prisma.eodWindowDefault.findFirst.mockResolvedValue(defaultRow());
    prisma.eodWindowDefault.update.mockResolvedValue(defaultRow({ endTime: '23:30' }));
    const result = await service.upsertDefault(
      { startTime: '18:00', endTime: '23:30', enabled: true },
      admin,
    );
    expect(prisma.eodWindowDefault.update).toHaveBeenCalled();
    expect(result.endTime).toBe('23:30');
  });
});
