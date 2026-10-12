import {
  categoryKey,
  defaultWorkforceRows,
  entriesToRows,
  hoursOutOfRange,
  isDefaultCategory,
  parseWorkforceJson,
  rowManHours,
  rowTotals,
  rowsToEntries,
  sanitizeHoursInput,
  sanitizePersonnelInput,
  type WorkforceRow,
} from '../workforce';

/**
 * EOD workforce arithmetic.
 *
 * Man-hours end up in an official report, so they are personnel x hours in
 * fixed point (the shared helper the API also uses), never float maths. These
 * are the cases that would drift if somebody "simplified" it.
 */
const row = (category: string, personnel: string, hours: string): WorkforceRow => ({
  key: category,
  category,
  personnel,
  hours,
});

describe('rowManHours', () => {
  it('is personnel x hours', () => {
    expect(rowManHours(row('Stewards', '12', '8'))).toBe('96.00');
    expect(rowManHours(row('Marshals', '3', '7.5'))).toBe('22.50');
  });

  it('multiplies fractional hours exactly', () => {
    // 3 x 0.1 is 0.30000000000000004 in IEEE arithmetic.
    expect(rowManHours(row('A', '3', '0.1'))).toBe('0.30');
    expect(rowManHours(row('A', '7', '7.35'))).toBe('51.45');
  });

  it('treats blank or half-typed inputs as zero, never NaN', () => {
    expect(rowManHours(row('A', '', '8'))).toBe('0.00');
    expect(rowManHours(row('A', '4', ''))).toBe('0.00');
    expect(rowManHours(row('A', '4', '.'))).toBe('0.00');
    expect(rowManHours(row('A', '4', '7.'))).toBe('28.00');
  });
});

describe('rowTotals', () => {
  it('sums personnel and man-hours', () => {
    expect(rowTotals([row('LOC Staff', '24', '8'), row('Stewards', '11', '8.5')])).toEqual({
      totalHeadcount: 35,
      totalManHours: '285.50',
    });
  });

  it('is zero for no rows', () => {
    expect(rowTotals([])).toEqual({ totalHeadcount: 0, totalManHours: '0.00' });
  });

  it('stays exact across many rows', () => {
    const rows = Array.from({ length: 100 }, (_, index) => row(`C${index}`, '3', '2.45'));
    expect(rowTotals(rows)).toEqual({ totalHeadcount: 300, totalManHours: '735.00' });
  });
});

describe('parseWorkforceJson', () => {
  it('reads the current shape and recomputes man-hours', () => {
    const json = JSON.stringify([{ category: 'Stewards', personnel: 10, hours: '8.00', manHours: '999.00' }]);
    expect(parseWorkforceJson(json)).toEqual([
      { category: 'Stewards', personnel: 10, hours: '8.00', manHours: '80.00' },
    ]);
  });

  it('maps the legacy { contractor, headcount, manHours } shape', () => {
    const json = JSON.stringify([
      { contractor: 'Alpha', headcount: 24, manHours: '192.00' },
      { contractor: 'Beta', headcount: 0, manHours: '10.00' },
    ]);
    expect(parseWorkforceJson(json)).toEqual([
      { category: 'Alpha', personnel: 24, hours: '8.00', manHours: '192.00' },
      // No headcount: hours cannot be derived, so 0 (as the API maps it).
      { category: 'Beta', personnel: 0, hours: '0.00', manHours: '0.00' },
    ]);
  });

  it('caps legacy hours per person at 24', () => {
    const json = JSON.stringify([{ contractor: 'Night', headcount: 1, manHours: '30.00' }]);
    expect(parseWorkforceJson(json)[0]).toMatchObject({ hours: '24.00', manHours: '24.00' });
  });

  it('returns [] for corrupt or non-array JSON', () => {
    expect(parseWorkforceJson('{not json')).toEqual([]);
    expect(parseWorkforceJson('{"a":1}')).toEqual([]);
    expect(parseWorkforceJson(null)).toEqual([]);
  });
});

describe('rows <-> entries', () => {
  it('round-trips, dropping blank custom rows', () => {
    const entries = rowsToEntries([row('Stewards', '5', '8.5'), row('', '', '')]);
    expect(entries).toEqual([{ category: 'Stewards', personnel: 5, hours: '8.50', manHours: '42.50' }]);
    expect(entriesToRows(entries)[0]).toMatchObject({ category: 'Stewards', personnel: '5', hours: '8.5' });
  });

  it('starts a new report with every default category, zeroed', () => {
    const rows = defaultWorkforceRows();
    expect(rows.map((entry) => entry.category)).toEqual([
      'LOC Staff',
      'Contractor Staff',
      'Stewards',
      'Marshals',
      'Volunteers',
      'Catering Staff',
      'Medical Staff',
    ]);
    expect(new Set(rows.map((entry) => entry.key)).size).toBe(rows.length);
    expect(rowTotals(rows)).toEqual({ totalHeadcount: 0, totalManHours: '0.00' });
  });

  it('keys default categories for translation', () => {
    expect(categoryKey('LOC Staff')).toBe('locStaff');
    expect(categoryKey('Catering Staff')).toBe('cateringStaff');
    expect(isDefaultCategory('Stewards')).toBe(true);
    expect(isDefaultCategory('Security')).toBe(false);
  });
});

describe('input sanitizers', () => {
  it('keeps personnel to whole numbers', () => {
    expect(sanitizePersonnelInput('12a')).toBe('12');
    expect(sanitizePersonnelInput('007')).toBe('7');
    expect(sanitizePersonnelInput('1.5')).toBe('15');
  });

  it('keeps hours to two decimals and at most 24', () => {
    expect(sanitizeHoursInput('7.555')).toBe('7.55');
    expect(sanitizeHoursInput('7,5')).toBe('7.5');
    expect(sanitizeHoursInput('30')).toBe('24');
    expect(sanitizeHoursInput('8.')).toBe('8.');
    expect(hoursOutOfRange('25')).toBe(true);
    expect(hoursOutOfRange('24')).toBe(false);
    expect(hoursOutOfRange('')).toBe(false);
  });
});
