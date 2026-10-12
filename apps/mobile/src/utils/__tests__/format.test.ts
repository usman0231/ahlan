import {
  formatBytes,
  formatCountdown,
  formatDate,
  formatDecimal,
  formatInt,
  formatPercent,
  formatPercentExact,
  formatTime,
  initials,
  relativeDay,
  timeAgo,
} from '../format';

const LABELS = { today: 'Today', yesterday: 'Yesterday' };

describe('percentages', () => {
  it('shows a dash rather than 0% when there is no score', () => {
    // "No score" and 0% mean different things: all-NA is not a failure.
    expect(formatPercent(null)).toBe('—');
    expect(formatPercent(0)).toBe('0.0%');
  });

  it('shows one decimal in lists and two where exactness matters', () => {
    expect(formatPercent(66.666)).toBe('66.7%');
    expect(formatPercentExact(66.666)).toBe('66.67%');
  });
});

describe('numbers', () => {
  it('dashes a missing integer', () => {
    expect(formatInt(null)).toBe('—');
    expect(formatInt(undefined)).toBe('—');
  });

  it('keeps man-hours at two decimals', () => {
    expect(formatDecimal('280.50')).toContain('280');
    expect(formatDecimal('280.50')).toContain('.50');
    expect(formatDecimal(null)).toBe('—');
  });
});

describe('stadium-local time', () => {
  // 19:00 UTC is 22:00 in Riyadh. The inspector must see the stadium's clock.
  const instant = new Date('2026-10-06T19:00:00Z');

  it('formats the time in the stadium zone', () => {
    expect(formatTime(instant, 'Asia/Riyadh')).toBe('22:00');
    expect(formatTime(instant, 'UTC')).toBe('19:00');
  });

  it('formats the date in the stadium zone', () => {
    // 23:30Z on the 5th is already the 6th in Riyadh.
    const lateEvening = new Date('2026-10-05T23:30:00Z');
    expect(formatDate(lateEvening, 'Asia/Riyadh')).toContain('6');
    expect(formatDate(lateEvening, 'UTC')).toContain('5');
  });
});

describe('formatCountdown', () => {
  it('reads as hours and minutes while there is time left', () => {
    expect(formatCountdown(2 * 3_600_000 + 15 * 60_000)).toBe('2h 15m');
    expect(formatCountdown(45 * 60_000)).toBe('45m');
  });

  it('floors at zero rather than going negative', () => {
    expect(formatCountdown(0)).toBe('0m');
    expect(formatCountdown(-5000)).toBe('0m');
  });
});

describe('relativeDay', () => {
  it('names today and yesterday', () => {
    expect(relativeDay('2026-10-06', '2026-10-06', LABELS)).toBe('Today');
    expect(relativeDay('2026-10-05', '2026-10-06', LABELS)).toBe('Yesterday');
  });

  it('falls back to a date further back', () => {
    const label = relativeDay('2026-09-28', '2026-10-06', LABELS);
    expect(label).not.toBe('Today');
    expect(label).toContain('28');
  });
});

describe('timeAgo', () => {
  it('says never when nothing has synced', () => {
    expect(timeAgo(null, 'never')).toBe('never');
  });

  it('reads in minutes and hours', () => {
    expect(timeAgo(Date.now() - 5 * 60_000, 'never')).toBe('5m ago');
    expect(timeAgo(Date.now() - 3 * 3_600_000, 'never')).toBe('3h ago');
    expect(timeAgo(Date.now() - 10_000, 'never')).toBe('just now');
  });
});

describe('initials', () => {
  it('takes at most two initials', () => {
    expect(initials('Demo Inspector One')).toBe('DI');
    expect(initials('Admin')).toBe('A');
  });

  it('never returns an empty string', () => {
    expect(initials('   ')).toBe('?');
  });
});

describe('formatBytes', () => {
  it('scales the unit', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(2048)).toBe('2 KB');
    expect(formatBytes(3 * 1024 * 1024)).toBe('3.0 MB');
  });
});
