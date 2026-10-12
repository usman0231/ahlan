import { addDecimals, compareDecimals, subtractDecimals, toDecimalString } from '../decimal';
import { isUuid, uuidv7, uuidv7Timestamp } from '../ids';
import { addDays, daysBetween, eachDay, isoWeekRange, zonedDateString } from '../time';

describe('decimal', () => {
  it('adds exactly where floats would drift', () => {
    expect(addDecimals('0.10', '0.20')).toBe('0.30');
    expect(0.1 + 0.2).not.toBe(0.3); // the reason this module exists
  });

  it('normalises input shapes', () => {
    expect(toDecimalString(12)).toBe('12.00');
    expect(toDecimalString('12.5')).toBe('12.50');
    expect(toDecimalString('  7  ')).toBe('7.00');
  });

  it('rounds half-up at the third decimal', () => {
    expect(toDecimalString('1.005')).toBe('1.01');
    expect(toDecimalString('1.004')).toBe('1.00');
  });

  it('handles negatives', () => {
    expect(subtractDecimals('1.00', '2.50')).toBe('-1.50');
    expect(toDecimalString('-0.5')).toBe('-0.50');
  });

  it('compares without converting to float', () => {
    expect(compareDecimals('10.01', '10.1')).toBe(-1);
    expect(compareDecimals('10.10', '10.1')).toBe(0);
  });

  it('sums a large set of man-hours exactly', () => {
    const values = Array.from({ length: 1000 }, () => '0.01');
    expect(addDecimals(...values)).toBe('10.00');
  });
});

describe('uuid v7', () => {
  it('produces well-formed version 7 ids', () => {
    const id = uuidv7();
    expect(isUuid(id)).toBe(true);
    expect(id.charAt(14)).toBe('7');
  });

  it('is time-ordered, including inside one millisecond', () => {
    const ids = Array.from({ length: 50 }, () => uuidv7(1_760_000_000_000));
    const sorted = [...ids].sort();
    expect(ids).toEqual(sorted);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('round-trips its timestamp', () => {
    const now = 1_760_000_123_456;
    expect(uuidv7Timestamp(uuidv7(now))).toBe(now);
  });

  it('returns null for a non-v7 uuid', () => {
    expect(uuidv7Timestamp('00000000-0000-4000-8000-000000000000')).toBeNull();
    expect(uuidv7Timestamp('nope')).toBeNull();
  });
});

describe('time', () => {
  it('resolves the stadium-local date of an instant', () => {
    // 23:30Z on the 5th is already the 6th in Riyadh.
    expect(zonedDateString(new Date('2026-10-05T23:30:00Z'), 'Asia/Riyadh')).toBe('2026-10-06');
    expect(zonedDateString(new Date('2026-10-05T23:30:00Z'), 'UTC')).toBe('2026-10-05');
  });

  it('adds days across a month boundary', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
  });

  it('counts days between dates', () => {
    expect(daysBetween('2026-10-01', '2026-10-06')).toBe(5);
    expect(daysBetween('2026-10-06', '2026-10-01')).toBe(-5);
  });

  it('bounds the ISO week Monday to Sunday', () => {
    // 2026-10-06 is a Tuesday.
    expect(isoWeekRange('2026-10-06')).toEqual({ start: '2026-10-05', end: '2026-10-11' });
    expect(isoWeekRange('2026-10-05')).toEqual({ start: '2026-10-05', end: '2026-10-11' });
    expect(isoWeekRange('2026-10-11')).toEqual({ start: '2026-10-05', end: '2026-10-11' });
  });

  it('enumerates an inclusive date range', () => {
    expect(eachDay('2026-10-04', '2026-10-06')).toEqual([
      '2026-10-04',
      '2026-10-05',
      '2026-10-06',
    ]);
    expect(eachDay('2026-10-06', '2026-10-06')).toEqual(['2026-10-06']);
    expect(eachDay('2026-10-07', '2026-10-06')).toEqual([]);
  });
});
