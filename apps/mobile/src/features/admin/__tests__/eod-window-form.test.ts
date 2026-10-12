import {
  crossesMidnight,
  eodRangeFor,
  formatHourMinute,
  isEodWindowDirty,
  parseHourMinute,
  validateEodWindowForm,
  windowDurationMinutes,
} from '../eod-window-form';

describe('parseHourMinute / formatHourMinute', () => {
  it('accepts 24-hour HH:mm only', () => {
    expect(parseHourMinute('18:00')).toEqual({ hour: 18, minute: 0 });
    expect(parseHourMinute(' 07:05 ')).toEqual({ hour: 7, minute: 5 });
    expect(parseHourMinute('24:00')).toBeNull();
    expect(parseHourMinute('7:05')).toBeNull();
    expect(parseHourMinute('18:60')).toBeNull();
    expect(parseHourMinute('')).toBeNull();
  });

  it('pads and wraps', () => {
    expect(formatHourMinute(6, 5)).toBe('06:05');
    expect(formatHourMinute(24, 0)).toBe('00:00');
    expect(formatHourMinute(-1, 0)).toBe('23:00');
  });
});

describe('window shape', () => {
  it('detects a window crossing midnight', () => {
    expect(crossesMidnight('20:00', '01:00')).toBe(true);
    expect(crossesMidnight('18:00', '23:00')).toBe(false);
    expect(crossesMidnight('bad', '01:00')).toBe(false);
  });

  it('measures the duration, wrapping past midnight', () => {
    expect(windowDurationMinutes('18:00', '23:00')).toBe(300);
    expect(windowDurationMinutes('22:30', '01:00')).toBe(150);
    expect(windowDurationMinutes('18:00', '18:00')).toBeNull();
    expect(windowDurationMinutes('x', '18:00')).toBeNull();
  });
});

describe('validateEodWindowForm', () => {
  it('passes a normal and an overnight window', () => {
    expect(validateEodWindowForm({ startTime: '18:00', endTime: '23:00', enabled: true })).toEqual(
      {},
    );
    expect(validateEodWindowForm({ startTime: '20:00', endTime: '02:00', enabled: false })).toEqual(
      {},
    );
  });

  it('flags malformed times', () => {
    expect(validateEodWindowForm({ startTime: '25:00', endTime: '2300', enabled: true })).toEqual({
      startTime: 'admin.eodWindow.errors.time',
      endTime: 'admin.eodWindow.errors.time',
    });
  });

  it('refuses a zero-length window', () => {
    expect(validateEodWindowForm({ startTime: '18:00', endTime: '18:00', enabled: true })).toEqual({
      endTime: 'admin.eodWindow.errors.same',
    });
  });
});

describe('isEodWindowDirty', () => {
  const saved = { startTime: '18:00', endTime: '23:00', enabled: true };

  it('is clean when nothing changed', () => {
    expect(isEodWindowDirty(saved, { ...saved })).toBe(false);
  });

  it('notices each field', () => {
    expect(isEodWindowDirty(saved, { ...saved, startTime: '17:00' })).toBe(true);
    expect(isEodWindowDirty(saved, { ...saved, endTime: '22:00' })).toBe(true);
    expect(isEodWindowDirty(saved, { ...saved, enabled: false })).toBe(true);
  });

  it('is dirty when nothing was saved yet', () => {
    expect(isEodWindowDirty(null, saved)).toBe(true);
  });
});

describe('eodRangeFor', () => {
  it('maps presets to inclusive date ranges', () => {
    expect(eodRangeFor('today', '2026-10-12')).toEqual({ from: '2026-10-12', to: '2026-10-12' });
    expect(eodRangeFor('7', '2026-10-12')).toEqual({ from: '2026-10-06', to: '2026-10-12' });
    expect(eodRangeFor('30', '2026-10-12')).toEqual({ from: '2026-09-13', to: '2026-10-12' });
    expect(eodRangeFor('all', '2026-10-12')).toEqual({});
  });
});
