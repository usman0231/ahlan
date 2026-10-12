import { checkEodWindow, eodWindowBounds, msUntilEodWindowCloses } from '../eod-window';
import { ERROR_CODES } from '../errors';

const RIYADH = 'Asia/Riyadh'; // UTC+3, no DST
const LONDON = 'Europe/London'; // UTC+0 / UTC+1

const window = {
  date: '2026-10-06',
  startTime: '18:00',
  endTime: '23:00',
  enabled: true,
};

describe('eodWindowBounds', () => {
  it('resolves stadium-local times to UTC instants', () => {
    const bounds = eodWindowBounds(window, RIYADH);
    expect(bounds.opensAt.toISOString()).toBe('2026-10-06T15:00:00.000Z');
    expect(bounds.closesAt.toISOString()).toBe('2026-10-06T20:00:00.000Z');
    expect(bounds.crossesMidnight).toBe(false);
  });

  it('carries a window past midnight into the next day', () => {
    const bounds = eodWindowBounds(
      { ...window, startTime: '21:00', endTime: '02:00' },
      RIYADH,
    );
    expect(bounds.crossesMidnight).toBe(true);
    expect(bounds.opensAt.toISOString()).toBe('2026-10-06T18:00:00.000Z');
    expect(bounds.closesAt.toISOString()).toBe('2026-10-06T23:00:00.000Z');
  });

  it('honours the stadium zone, not the server zone', () => {
    // 6 Oct is British Summer Time, so 18:00 local is 17:00Z.
    const bounds = eodWindowBounds(window, LONDON);
    expect(bounds.opensAt.toISOString()).toBe('2026-10-06T17:00:00.000Z');
  });

  it('resolves correctly on the day the clocks go back', () => {
    // BST ends 25 Oct 2026 at 02:00 local; 18:00 local that day is 18:00Z.
    const bounds = eodWindowBounds({ ...window, date: '2026-10-25' }, LONDON);
    expect(bounds.opensAt.toISOString()).toBe('2026-10-25T18:00:00.000Z');
  });

  it('rejects a malformed window', () => {
    expect(() => eodWindowBounds({ ...window, startTime: '25:00' }, RIYADH)).toThrow();
  });
});

describe('checkEodWindow', () => {
  it('accepts a submission inside the window', () => {
    expect(checkEodWindow(window, RIYADH, new Date('2026-10-06T19:30:00Z')).open).toBe(true);
  });

  it('rejects before it opens', () => {
    expect(checkEodWindow(window, RIYADH, new Date('2026-10-06T14:59:59Z'))).toMatchObject({
      open: false,
      code: ERROR_CODES.EOD_WINDOW_CLOSED,
    });
  });

  it('rejects after it closes', () => {
    expect(checkEodWindow(window, RIYADH, new Date('2026-10-06T20:00:01Z'))).toMatchObject({
      open: false,
      code: ERROR_CODES.EOD_WINDOW_CLOSED,
    });
  });

  it('accepts the exact boundaries', () => {
    expect(checkEodWindow(window, RIYADH, new Date('2026-10-06T15:00:00Z')).open).toBe(true);
    expect(checkEodWindow(window, RIYADH, new Date('2026-10-06T20:00:00Z')).open).toBe(true);
  });

  it('rejects a disabled window', () => {
    expect(
      checkEodWindow({ ...window, enabled: false }, RIYADH, new Date('2026-10-06T19:00:00Z')),
    ).toMatchObject({ open: false, code: ERROR_CODES.EOD_WINDOW_CLOSED });
  });

  it('rejects when no window exists for the date', () => {
    expect(checkEodWindow(null, RIYADH)).toMatchObject({
      open: false,
      code: ERROR_CODES.EOD_WINDOW_CLOSED,
    });
  });
});

describe('msUntilEodWindowCloses', () => {
  it('counts down to the close', () => {
    expect(msUntilEodWindowCloses(window, RIYADH, new Date('2026-10-06T19:00:00Z'))).toBe(
      60 * 60 * 1000,
    );
  });

  it('floors at zero once closed', () => {
    expect(msUntilEodWindowCloses(window, RIYADH, new Date('2026-10-07T00:00:00Z'))).toBe(0);
  });
});
