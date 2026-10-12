import {
  emptyEodForm,
  formFromStored,
  resolveEodWindowState,
  validateEodForm,
} from '../eod-form';

const TZ = 'Asia/Riyadh';
/** 2026-10-12 20:00 in Riyadh (UTC+3). */
const EVENING = new Date('2026-10-12T17:00:00Z');
/** 2026-10-12 10:00 in Riyadh. */
const MORNING = new Date('2026-10-12T07:00:00Z');
const STADIUM = 'stadium-1';

const globalDefault = { stadiumId: null, startTime: '18:00', endTime: '23:00', enabled: true };

describe('resolveEodWindowState (offline window check)', () => {
  it('is OPEN inside the global recurring default', () => {
    const state = resolveEodWindowState({
      stadiumId: STADIUM,
      timeZone: TZ,
      perDate: [],
      defaults: [globalDefault],
      now: EVENING,
    });
    expect(state.status).toBe('OPEN');
    expect(state.closesAt?.toISOString()).toBe('2026-10-12T20:00:00.000Z');
  });

  it('is CLOSED before the window opens, and says when it opens', () => {
    const state = resolveEodWindowState({
      stadiumId: STADIUM,
      timeZone: TZ,
      perDate: [],
      defaults: [globalDefault],
      now: MORNING,
    });
    expect(state.status).toBe('CLOSED');
    expect(state.opensAt?.toISOString()).toBe('2026-10-12T15:00:00.000Z');
  });

  it('prefers a stadium default over the global one', () => {
    const state = resolveEodWindowState({
      stadiumId: STADIUM,
      timeZone: TZ,
      perDate: [],
      defaults: [globalDefault, { stadiumId: STADIUM, startTime: '08:00', endTime: '12:00', enabled: true }],
      now: MORNING,
    });
    expect(state.status).toBe('OPEN');
  });

  it('lets a per-date row override the defaults, even to disable the day', () => {
    const state = resolveEodWindowState({
      stadiumId: STADIUM,
      timeZone: TZ,
      perDate: [{ ...globalDefault, date: '2026-10-12', enabled: false }],
      defaults: [globalDefault],
      now: EVENING,
    });
    expect(state.status).toBe('DISABLED');
  });

  it("keeps yesterday's window open past midnight", () => {
    const state = resolveEodWindowState({
      stadiumId: STADIUM,
      timeZone: TZ,
      perDate: [],
      defaults: [{ stadiumId: null, startTime: '20:00', endTime: '02:00', enabled: true }],
      // 01:00 on the 13th in Riyadh.
      now: new Date('2026-10-12T22:00:00Z'),
    });
    expect(state.status).toBe('OPEN');
  });

  it('is NONE when nothing has synced', () => {
    const state = resolveEodWindowState({
      stadiumId: STADIUM,
      timeZone: TZ,
      perDate: [],
      defaults: [],
      now: EVENING,
    });
    expect(state.status).toBe('NONE');
    expect(state.check.open).toBe(false);
  });
});

describe('validateEodForm', () => {
  it('requires 10 characters of highlights', () => {
    const values = { ...emptyEodForm(), summary: 'short' };
    expect(validateEodForm(values).summary).toBe('eod.errors.summaryTooShort');
    expect(validateEodForm({ ...values, summary: 'All gates checked today.' }).summary).toBeUndefined();
  });

  it('flags hours over 24 and a custom row with numbers but no name', () => {
    const values = {
      ...emptyEodForm(),
      summary: 'All gates checked today.',
      workforce: [
        { key: 'a', category: 'Stewards', personnel: '3', hours: '25' },
        { key: 'b', category: '', personnel: '2', hours: '' },
        { key: 'c', category: '', personnel: '', hours: '' },
      ],
    };
    expect(validateEodForm(values)).toEqual({
      'hours:a': 'eod.errors.hoursRange',
      'category:b': 'eod.errors.categoryRequired',
    });
  });
});

describe('formFromStored', () => {
  const stored = {
    workforce: [],
    totalSpectators: null,
    workRelatedMedical: null,
    nonWorkRelatedMedical: 2,
    firstAidCases: null,
    fireIncidents: null,
    otherIncidents: null,
    hseObservationsReported: null,
    recordableIncidents: 3,
    summary: 'Gates opened on time.',
    concerns: null,
    actionsMitigation: null,
    plannedTomorrow: null,
    additionalRemarks: null,
  };

  it('starts an empty draft from the default rows', () => {
    expect(formFromStored(stored).workforce).toHaveLength(7);
  });

  it('carries a legacy draft’s recordable incidents into work-related medical', () => {
    const form = formFromStored(stored);
    expect(form.stats.workRelatedMedical).toBe('3');
    expect(form.stats.nonWorkRelatedMedical).toBe('2');
    expect(form.summary).toBe('Gates opened on time.');
  });
});
