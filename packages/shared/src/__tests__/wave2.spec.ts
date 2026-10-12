import {
  checklistAppliesToStadium,
  checklistCompletionFor,
  progressPercent,
  readinessChecklistsFor,
  stadiumChecklistProgress,
} from '../completion';
import { divideDecimalByInt } from '../decimal';
import {
  allowedEodReportDates,
  checkEodSubmissionWindow,
  eodDefaultWindowState,
  isAllowedEodReportDate,
  resolveEodWindow,
} from '../eod-window';
import { eodWorkforceTotals, resolveEodIncidentStats, workforceManHours } from '../eod-rules';
import { listStadiumsQuerySchema } from '../schemas/catalog';
import { queryBooleanSchema } from '../schemas/common';
import {
  correctEodSchema,
  eodWorkforceEntryInputSchema,
  normalizeLegacyWorkforceEntry,
  submitEodSchema,
  upsertEodWindowDefaultSchema,
} from '../schemas/eod';
import { listFindingsQuerySchema } from '../schemas/finding';
import { submitInspectionSchema } from '../schemas/inspection';
import { kpiQuerySchema } from '../schemas/kpi';

const RIYADH = 'Asia/Riyadh'; // UTC+3, no DST
const ID = (n: number) => `01930000-0000-7000-8000-${String(n).padStart(12, '0')}`;

describe('workforce man-hours', () => {
  it('is personnel x hours in fixed point', () => {
    expect(workforceManHours({ personnel: 12, hours: '8.50' })).toBe('102.00');
    expect(workforceManHours({ personnel: 3, hours: '0.33' })).toBe('0.99');
    expect(workforceManHours({ personnel: 0, hours: '12.00' })).toBe('0.00');
  });

  it('treats a non-integer or negative personnel as zero', () => {
    expect(workforceManHours({ personnel: Number.NaN, hours: '8' })).toBe('0.00');
    expect(workforceManHours({ personnel: -4, hours: '8' })).toBe('0.00');
  });

  it('totals headcount and man-hours exactly', () => {
    expect(
      eodWorkforceTotals([
        { personnel: 10, hours: '0.10' },
        { personnel: 20, hours: '0.20' },
        { personnel: 100, hours: '12.25' },
      ]),
    ).toEqual({ totalHeadcount: 130, totalManHours: '1230.00' });
    expect(eodWorkforceTotals([])).toEqual({ totalHeadcount: 0, totalManHours: '0.00' });
  });
});

describe('legacy workforce lines', () => {
  it('maps contractor/headcount/manHours to category/personnel/hours', () => {
    expect(normalizeLegacyWorkforceEntry({ contractor: 'Alpha', headcount: 24, manHours: '192.00' })).toEqual({
      category: 'Alpha',
      personnel: 24,
      hours: '8.00',
    });
  });

  it('rounds hours to 2dp, caps them at 24 and uses 0 for no headcount', () => {
    expect(normalizeLegacyWorkforceEntry({ contractor: 'A', headcount: 3, manHours: '10' })).toMatchObject({
      hours: '3.33',
    });
    expect(normalizeLegacyWorkforceEntry({ contractor: 'A', headcount: 1, manHours: '30' })).toMatchObject({
      hours: '24.00',
    });
    expect(normalizeLegacyWorkforceEntry({ contractor: 'A', headcount: 0, manHours: '8' })).toMatchObject({
      hours: '0.00',
    });
  });

  it('passes the current shape through untouched', () => {
    const entry = { category: 'Stewards', personnel: 5, hours: '8.00' };
    expect(normalizeLegacyWorkforceEntry(entry)).toBe(entry);
  });

  it('is accepted by the input schema', () => {
    const parsed = eodWorkforceEntryInputSchema.parse({ contractor: 'Beta', headcount: 10, manHours: '85' });
    expect(parsed).toEqual({ category: 'Beta', personnel: 10, hours: '8.50' });
  });

  it('rejects hours above 24 on the current shape', () => {
    expect(
      eodWorkforceEntryInputSchema.safeParse({ category: 'Stewards', personnel: 1, hours: '24.01' }).success,
    ).toBe(false);
    expect(
      eodWorkforceEntryInputSchema.safeParse({ category: 'Stewards', personnel: 1, hours: 7.5 }).success,
    ).toBe(true);
  });
});

describe('divideDecimalByInt', () => {
  it('rounds half up', () => {
    expect(divideDecimalByInt('10.00', 3)).toBe('3.33');
    expect(divideDecimalByInt('0.05', 2)).toBe('0.03');
    expect(() => divideDecimalByInt('1', 0)).toThrow(TypeError);
  });
});

describe('resolveEodIncidentStats', () => {
  it('prefers workRelatedMedical and mirrors it into recordableIncidents', () => {
    expect(resolveEodIncidentStats({ workRelatedMedical: 2, recordableIncidents: 5 })).toEqual({
      workRelatedMedical: 2,
      recordableIncidents: 2,
    });
  });

  it('falls back to a legacy recordableIncidents', () => {
    expect(resolveEodIncidentStats({ recordableIncidents: 3 })).toEqual({
      workRelatedMedical: 3,
      recordableIncidents: 3,
    });
    expect(resolveEodIncidentStats({})).toEqual({ workRelatedMedical: 0, recordableIncidents: 0 });
  });
});

describe('resolveEodWindow precedence', () => {
  const t = (startTime: string, enabled = true) => ({ startTime, endTime: '23:00', enabled });

  it('per-date stadium > per-date global > stadium default > global default', () => {
    const all = {
      perDateStadium: t('17:00'),
      perDateGlobal: t('18:00'),
      stadiumDefault: t('19:00'),
      globalDefault: t('20:00'),
    };
    expect(resolveEodWindow('2026-10-12', all)?.startTime).toBe('17:00');
    expect(resolveEodWindow('2026-10-12', { ...all, perDateStadium: null })?.startTime).toBe('18:00');
    expect(
      resolveEodWindow('2026-10-12', { ...all, perDateStadium: null, perDateGlobal: null })?.startTime,
    ).toBe('19:00');
    expect(resolveEodWindow('2026-10-12', { globalDefault: t('20:00') })).toEqual({
      date: '2026-10-12',
      startTime: '20:00',
      endTime: '23:00',
      enabled: true,
    });
    expect(resolveEodWindow('2026-10-12', {})).toBeNull();
  });

  it('lets a disabled per-date row close one day even when the default is open', () => {
    const resolved = resolveEodWindow('2026-10-12', {
      perDateGlobal: t('18:00', false),
      globalDefault: t('18:00'),
    });
    expect(resolved?.enabled).toBe(false);
  });
});

describe('checkEodSubmissionWindow', () => {
  const daily = (startTime: string, endTime: string) => (date: string) => ({
    date,
    startTime,
    endTime,
    enabled: true,
  });

  it('is open inside today’s window', () => {
    const now = new Date('2026-10-12T16:00:00Z'); // 19:00 Riyadh
    expect(checkEodSubmissionWindow(daily('18:00', '23:00'), RIYADH, now).open).toBe(true);
  });

  it('is closed before and after', () => {
    expect(
      checkEodSubmissionWindow(daily('18:00', '23:00'), RIYADH, new Date('2026-10-12T09:00:00Z')).open,
    ).toBe(false);
    expect(
      checkEodSubmissionWindow(daily('18:00', '23:00'), RIYADH, new Date('2026-10-12T20:30:00Z')).open,
    ).toBe(false);
  });

  it('uses yesterday’s window when it runs past midnight', () => {
    const now = new Date('2026-10-12T22:30:00Z'); // 01:30 Riyadh on the 13th
    const check = checkEodSubmissionWindow(daily('21:00', '02:00'), RIYADH, now);
    expect(check.open).toBe(true);
  });

  it('is closed with no window at all', () => {
    const check = checkEodSubmissionWindow(() => null, RIYADH, new Date('2026-10-12T16:00:00Z'));
    expect(check.open).toBe(false);
  });
});

describe('eodDefaultWindowState', () => {
  const def = { startTime: '18:00', endTime: '23:00', enabled: true };

  it('reports OPEN / CLOSED / DISABLED', () => {
    expect(eodDefaultWindowState(def, RIYADH, new Date('2026-10-12T16:00:00Z')).status).toBe('OPEN');
    expect(eodDefaultWindowState(def, RIYADH, new Date('2026-10-12T09:00:00Z')).status).toBe('CLOSED');
    expect(eodDefaultWindowState({ ...def, enabled: false }, RIYADH).status).toBe('DISABLED');
    expect(eodDefaultWindowState(null, RIYADH).status).toBe('DISABLED');
  });

  it('returns the closing instant while open', () => {
    const state = eodDefaultWindowState(def, RIYADH, new Date('2026-10-12T16:00:00Z'));
    expect(state.closesAt?.toISOString()).toBe('2026-10-12T20:00:00.000Z');
  });
});

describe('EOD report date', () => {
  const now = new Date('2026-10-12T22:30:00Z'); // 01:30 on 13 Oct in Riyadh

  it('allows today and yesterday in the stadium zone only', () => {
    expect(allowedEodReportDates(RIYADH, now)).toEqual(['2026-10-13', '2026-10-12']);
    expect(isAllowedEodReportDate('2026-10-12', RIYADH, now)).toBe(true);
    expect(isAllowedEodReportDate('2026-10-11', RIYADH, now)).toBe(false);
    expect(isAllowedEodReportDate('2026-10-14', RIYADH, now)).toBe(false);
  });
});

describe('checklist completion', () => {
  it('treats an empty stadium list as all stadiums', () => {
    expect(checklistAppliesToStadium([], ID(1))).toBe(true);
    expect(checklistAppliesToStadium([ID(2)], ID(1))).toBe(false);
  });

  it('expects only active READINESS checklists that apply', () => {
    const checklists = [
      { id: 'a', category: 'READINESS' as const, isActive: true, stadiumIds: [] },
      { id: 'b', category: 'READINESS' as const, isActive: false, stadiumIds: [] },
      { id: 'c', category: 'DISCIPLINE' as const, isActive: true, stadiumIds: [] },
      { id: 'd', category: 'READINESS' as const, isActive: true, stadiumIds: [ID(9)] },
    ];
    expect(readinessChecklistsFor(checklists, ID(1)).map((c) => c.id)).toEqual(['a']);
    expect(readinessChecklistsFor(checklists, ID(9)).map((c) => c.id)).toEqual(['a', 'd']);
  });

  it('counts distinct expected checklists done', () => {
    expect(stadiumChecklistProgress(['a', 'b', 'c'], ['a', 'a', 'x'])).toEqual({
      done: 1,
      expected: 3,
      percent: 33.33,
    });
    expect(stadiumChecklistProgress([], ['a'])).toEqual({ done: 0, expected: 0, percent: null });
    expect(progressPercent(7, 6)).toBe(100);
  });

  it('builds one slot per inspector per applicable stadium', () => {
    const assignments = [
      { userId: 'u1', fullName: 'One', stadiumId: ID(1), stadiumCode: 'AAA' },
      { userId: 'u1', fullName: 'One', stadiumId: ID(2), stadiumCode: 'BBB' },
      { userId: 'u2', fullName: 'Two', stadiumId: ID(1), stadiumCode: 'AAA' },
      { userId: 'u2', fullName: 'Two', stadiumId: ID(1), stadiumCode: 'AAA' }, // duplicate
    ];
    const result = checklistCompletionFor([], assignments, [
      { inspectorId: 'u1', stadiumId: ID(1), inspectionId: 'i1' },
      { inspectorId: 'u1', stadiumId: ID(1), inspectionId: 'i2' },
      { inspectorId: 'u3', stadiumId: ID(1), inspectionId: 'i3' }, // not assigned
    ]);
    expect(result.expected).toBe(3);
    expect(result.completed).toBe(1);
    expect(result.pending).toBe(2);
    expect(result.inspectors[0]).toMatchObject({ userId: 'u1', status: 'COMPLETED', inspectionId: 'i1' });

    const scoped = checklistCompletionFor([ID(2)], assignments, []);
    expect(scoped.expected).toBe(1);
    expect(scoped.inspectors[0]).toMatchObject({ stadiumCode: 'BBB', status: 'PENDING', inspectionId: null });
  });
});

describe('query booleans', () => {
  it('parses "false" as false (z.coerce.boolean would say true)', () => {
    expect(queryBooleanSchema.parse('false')).toBe(false);
    expect(queryBooleanSchema.parse('true')).toBe(true);
    expect(queryBooleanSchema.parse('0')).toBe(false);
    expect(queryBooleanSchema.parse('1')).toBe(true);
    expect(queryBooleanSchema.parse(false)).toBe(false);
    expect(queryBooleanSchema.safeParse('maybe').success).toBe(false);
  });

  it('is used by the list query schemas', () => {
    expect(listStadiumsQuerySchema.parse({ isActive: 'false' }).isActive).toBe(false);
    expect(listStadiumsQuerySchema.parse({}).isActive).toBeUndefined();
    expect(listFindingsQuerySchema.parse({ overdueOnly: 'false' })).toMatchObject({ overdueOnly: false });
    expect(kpiQuerySchema.parse({ compare: 'false' }).compare).toBe(false);
    expect(kpiQuerySchema.parse({}).compare).toBe(true);
  });
});

describe('wave 2 payloads', () => {
  const base = {
    id: ID(1),
    stadiumId: ID(2),
    date: '2026-10-12',
    clientCreatedAt: '2026-10-12T16:00:00Z',
    submittedAt: '2026-10-12T16:00:00Z',
    summary: 'Highlights of the day were good.',
  };

  it('accepts the new EOD fields and defaults the stats to 0', () => {
    const parsed = submitEodSchema.parse({
      ...base,
      workforce: [{ category: 'Stewards', personnel: '40', hours: '8' }],
      totalSpectators: 30000,
      firstAidCases: 3,
      actionsMitigation: 'Cable covers added.',
    });
    expect(parsed.workforce[0]).toEqual({ category: 'Stewards', personnel: 40, hours: '8' });
    expect(parsed.workRelatedMedical).toBeUndefined();
    expect(parsed.fireIncidents).toBe(0);
    expect(parsed.totalSpectators).toBe(30000);
  });

  it('still requires a summary of at least 10 characters on submit', () => {
    expect(submitEodSchema.safeParse({ ...base, summary: 'short' }).success).toBe(false);
  });

  it('accepts new fields on an admin correction', () => {
    expect(
      correctEodSchema.safeParse({ reason: 'Corrected the spectator count', totalSpectators: 100 }).success,
    ).toBe(true);
  });

  it('validates the window default body', () => {
    expect(upsertEodWindowDefaultSchema.parse({ startTime: '18:00', endTime: '23:00' }).enabled).toBe(true);
    expect(upsertEodWindowDefaultSchema.safeParse({ startTime: '25:00', endTime: '23:00' }).success).toBe(
      false,
    );
  });

  it('allows photos on YES, requires one on NO, and carries concern/recommendation', () => {
    const inspection = {
      id: ID(3),
      stadiumId: ID(2),
      checklistId: ID(4),
      checklistVersionId: ID(5),
      startedAt: '2026-10-12T06:00:00Z',
      submittedAt: '2026-10-12T07:00:00Z',
      clientCreatedAt: '2026-10-12T06:00:00Z',
      locationLabel: 'Gate A',
      otherObservations: 'Nothing else.',
    };
    const response = (value: 'YES' | 'NO', evidenceIds: string[]) => ({
      id: ID(6),
      itemId: ID(7),
      value,
      evidenceIds,
      answeredAt: '2026-10-12T07:00:00Z',
      concern: 'Loose barrier',
      recommendation: 'Re-ballast',
    });
    expect(submitInspectionSchema.safeParse({ ...inspection, responses: [response('YES', [ID(8)])] }).success).toBe(
      true,
    );
    expect(submitInspectionSchema.safeParse({ ...inspection, responses: [response('NO', [])] }).success).toBe(false);
    const parsed = submitInspectionSchema.parse({ ...inspection, responses: [response('NO', [ID(8)])] });
    expect(parsed.locationLabel).toBe('Gate A');
    expect(parsed.responses[0]).toMatchObject({ concern: 'Loose barrier', recommendation: 'Re-ballast' });
  });
});
