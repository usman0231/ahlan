import { ERROR_CODES } from '@ahlan/shared';

import { KpisService } from './kpis.service';
import type { EodWindowsService } from '../eod/eod-windows.service';
import type { PrismaService } from '../../prisma/prisma.service';
import type { StorageService } from '../../storage/storage.service';
import type { RequestUser } from '../../common/types/request-user';

const A = '01930000-0000-7000-8000-000000000001';
const B = '01930000-0000-7000-8000-000000000002';
const DISCIPLINE = '01930000-0000-7000-8000-0000000000d1';
const R = (n: number) => `01930000-0000-7000-8000-0000000001${String(n).padStart(2, '0')}`;

const admin: RequestUser = {
  id: '01930000-0000-7000-8000-00000000000a',
  email: 'admin@example.test',
  fullName: 'Admin',
  role: 'ADMIN',
  sessionId: '01930000-0000-7000-8000-00000000000b',
  stadiumIds: [],
};
const inspector: RequestUser = { ...admin, role: 'INSPECTOR', stadiumIds: [A] };
const supervisor: RequestUser = { ...admin, role: 'SUPERVISOR', stadiumIds: [A] };

function stadium(id: string, code: string) {
  return {
    id,
    code,
    name: `Stadium ${code}`,
    nameAr: null,
    city: 'Riyadh',
    timezone: 'Asia/Riyadh',
    assignments: [{ user: { id: 'u-' + code, fullName: `Inspector ${code}` } }],
  };
}

function harness() {
  const prisma = {
    stadium: { findMany: jest.fn() },
    checklist: {
      findMany: jest.fn().mockResolvedValue(
        [1, 2, 3, 4, 5, 6].map((n) => ({
          id: R(n),
          category: 'READINESS',
          isActive: true,
          stadiums: n === 6 ? [{ stadiumId: B }] : [],
        })),
      ),
    },
    inspection: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) },
    inspectionResponse: {
      groupBy: jest.fn().mockResolvedValue([
        { value: 'YES', _count: { _all: 9 } },
        { value: 'NO', _count: { _all: 1 } },
      ]),
      findFirst: jest.fn(),
    },
    finding: {
      groupBy: jest.fn().mockResolvedValue([{ stadiumId: A, _count: { _all: 4 } }]),
      count: jest.fn().mockResolvedValue(0),
    },
    observation: { count: jest.fn().mockResolvedValue(0), groupBy: jest.fn().mockResolvedValue([]) },
    tournament: {
      findFirst: jest.fn().mockResolvedValue({
        id: 'tournament-1',
        startDate: new Date('2026-09-22T00:00:00Z'),
        endDate: new Date('2026-11-01T00:00:00Z'),
      }),
      findUnique: jest.fn(),
    },
    discipline: {
      findUnique: jest.fn().mockResolvedValue({
        id: DISCIPLINE,
        slug: 'excavation',
        name: 'Excavation',
        nameAr: null,
        description: 'Excavations, trenches, access, barriers and ground conditions.',
        descriptionAr: null,
        icon: 'construction',
        colorToken: null,
        sortOrder: 2,
        isActive: true,
      }),
    },
  };
  const service = new KpisService(
    prisma as unknown as PrismaService,
    {} as unknown as EodWindowsService,
    { stadiumImageUrl: async (key: string | null) => (key ? `https://s3.test/${key}` : null) } as unknown as StorageService,
  );
  return { service, prisma };
}

describe('KpisService.stadiumCards', () => {
  it('counts distinct readiness checklists done against the ones that apply', async () => {
    const { service, prisma } = harness();
    prisma.stadium.findMany.mockResolvedValue([stadium(A, 'AAA'), stadium(B, 'BBB')]);
    prisma.inspection.findMany.mockResolvedValue([
      { stadiumId: A, checklistId: R(1), localDate: new Date('2026-10-12T00:00:00Z') },
      { stadiumId: A, checklistId: R(2), localDate: new Date('2026-10-12T00:00:00Z') },
      // Another day does not count.
      { stadiumId: A, checklistId: R(3), localDate: new Date('2026-10-11T00:00:00Z') },
      { stadiumId: B, checklistId: R(6), localDate: new Date('2026-10-12T00:00:00Z') },
    ]);

    const cards = await service.stadiumCards({ date: '2026-10-12' }, admin);

    expect(cards[0]).toMatchObject({
      code: 'AAA',
      date: '2026-10-12',
      checklistsDone: 2,
      checklistsExpected: 5,
      progressPercent: 40,
      findingsOpen: 4,
      compliancePercent: 90,
      assignedInspectors: [{ id: 'u-AAA', fullName: 'Inspector AAA' }],
    });
    expect(cards[1]).toMatchObject({ code: 'BBB', checklistsDone: 1, checklistsExpected: 6, findingsOpen: 0 });
  });

  it('limits inspectors and supervisors to their assigned stadiums', async () => {
    for (const actor of [inspector, supervisor]) {
      const { service, prisma } = harness();
      prisma.stadium.findMany.mockResolvedValue([stadium(A, 'AAA')]);
      await service.stadiumCards({}, actor);
      expect(prisma.stadium.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ id: { in: [A] } }) }),
      );
    }
  });

  it('does not narrow an admin', async () => {
    const { service, prisma } = harness();
    prisma.stadium.findMany.mockResolvedValue([]);
    expect(await service.stadiumCards({}, admin)).toEqual([]);
    const where = prisma.stadium.findMany.mock.calls[0][0].where;
    expect(where.id).toBeUndefined();
  });
});

describe('KpisService.disciplineDashboard', () => {
  it('rejects a stadium outside the caller’s scope', async () => {
    const { service } = harness();
    await expect(
      service.disciplineDashboard(DISCIPLINE, { stadiumId: B, from: '2026-10-01', to: '2026-10-12' }, supervisor),
    ).rejects.toMatchObject({ code: ERROR_CODES.STADIUM_OUT_OF_SCOPE });
  });

  it('scopes every query to the inspector’s stadiums and fills all types and severities', async () => {
    const { service, prisma } = harness();
    prisma.stadium.findMany.mockResolvedValue([{ id: A, code: 'AAA', name: 'Stadium AAA' }]);
    prisma.finding.groupBy.mockResolvedValue([]);
    prisma.observation.groupBy.mockImplementation(async (args: { by: string[] }) =>
      args.by[0] === 'type' ? [{ type: 'NEAR_MISS', _count: { _all: 3 } }] : [],
    );

    const dashboard = await service.disciplineDashboard(
      DISCIPLINE,
      { from: '2026-10-10', to: '2026-10-12' },
      inspector,
    );

    expect(dashboard.discipline.slug).toBe('excavation');
    expect(dashboard.byType).toHaveLength(4);
    expect(dashboard.byType.find((row) => row.type === 'NEAR_MISS')?.count).toBe(3);
    expect(dashboard.bySeverity).toHaveLength(4);
    expect(dashboard.daily.map((row) => row.date)).toEqual(['2026-10-10', '2026-10-11', '2026-10-12']);
    expect(dashboard.totals.compliancePercent).toBe(90);

    for (const call of prisma.observation.count.mock.calls) {
      expect(call[0].where).toMatchObject({ stadiumId: { in: [A] }, disciplineId: DISCIPLINE });
    }
    expect(prisma.stadium.findMany.mock.calls[0][0].where).toMatchObject({ id: { in: [A] } });
  });

  it('404s an unknown discipline', async () => {
    const { service, prisma } = harness();
    prisma.discipline.findUnique.mockResolvedValue(null);
    await expect(service.disciplineDashboard(DISCIPLINE, {}, admin)).rejects.toMatchObject({
      code: ERROR_CODES.NOT_FOUND,
    });
  });
});
