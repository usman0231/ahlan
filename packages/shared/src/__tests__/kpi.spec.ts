import {
  averageDaysToClose,
  closureRate,
  complianceBand,
  compliancePercent,
  compliancePercentFromResponses,
  countBySeverity,
  coveragePercent,
  deltaPoints,
  emptySeverityCounts,
  incidentRate,
  isChecklistComplete,
  isOverdue,
  riskIndex,
  roundTo,
  tallyResponses,
  totalManHours,
} from '../kpi';

describe('compliance', () => {
  it('is YES / (YES + NO) with NA excluded', () => {
    expect(compliancePercent({ yes: 8, no: 2, na: 5 })).toBe(80);
  });

  it('ignores NA entirely, so an all-NA inspection has no score', () => {
    expect(compliancePercent({ yes: 0, no: 0, na: 12 })).toBeNull();
  });

  it('distinguishes "no score" from 0%', () => {
    expect(compliancePercent({ yes: 0, no: 4, na: 0 })).toBe(0);
    expect(compliancePercent({ yes: 0, no: 0, na: 0 })).toBeNull();
  });

  it('reports 100% when nothing failed', () => {
    expect(compliancePercent({ yes: 7, no: 0, na: 3 })).toBe(100);
  });

  it('rounds to 2dp, half up', () => {
    // 2/3 -> 66.666...
    expect(compliancePercent({ yes: 2, no: 1, na: 0 })).toBe(66.67);
    // 1/6 -> 16.666...
    expect(compliancePercent({ yes: 1, no: 5, na: 0 })).toBe(16.67);
    // 1/8 -> 12.5
    expect(compliancePercent({ yes: 1, no: 7, na: 0 })).toBe(12.5);
  });

  it('computes straight from a response list', () => {
    expect(compliancePercentFromResponses(['YES', 'YES', 'NO', 'NA'])).toBe(66.67);
  });

  it('tallies responses', () => {
    expect(tallyResponses(['YES', 'NO', 'NA', 'YES'])).toEqual({ yes: 2, no: 1, na: 1 });
  });
});

describe('roundTo', () => {
  it('is half-up for positives and negatives alike', () => {
    expect(roundTo(1.005, 2)).toBe(1.01);
    expect(roundTo(-1.005, 2)).toBe(-1.01);
    expect(roundTo(2.5, 0)).toBe(3);
    expect(roundTo(-2.5, 0)).toBe(-3);
  });

  it('never returns NaN or Infinity', () => {
    expect(roundTo(Number.NaN)).toBe(0);
    expect(roundTo(Number.POSITIVE_INFINITY)).toBe(0);
  });
});

describe('checklist completeness', () => {
  it('requires every item to be answered', () => {
    expect(isChecklistComplete(9, 10)).toBe(false);
    expect(isChecklistComplete(10, 10)).toBe(true);
  });

  it('is never complete when the checklist has no items', () => {
    expect(isChecklistComplete(0, 0)).toBe(false);
  });
});

describe('riskIndex', () => {
  it('weights severities and normalises per 100 items', () => {
    const counts = countBySeverity(['CRITICAL', 'HIGH', 'LOW']);
    // (15 + 7 + 1) / 200 * 100
    expect(riskIndex(counts, 200)).toBe(11.5);
  });

  it('is 0 when nothing was inspected', () => {
    expect(riskIndex(emptySeverityCounts(), 0)).toBe(0);
  });
});

describe('overdue derivation', () => {
  const now = new Date('2026-10-06T09:00:00Z');

  it('is true for a past due date on an open action', () => {
    expect(isOverdue({ status: 'IN_PROGRESS', dueDate: '2026-10-05' }, now)).toBe(true);
  });

  it('is false once closed, however late', () => {
    expect(isOverdue({ status: 'CLOSED', dueDate: '2020-01-01' }, now)).toBe(false);
  });

  it('is false without a due date', () => {
    expect(isOverdue({ status: 'OPEN', dueDate: null }, now)).toBe(false);
  });

  it('is false for a future due date', () => {
    expect(isOverdue({ status: 'ACTION_ASSIGNED', dueDate: '2026-12-01' }, now)).toBe(false);
  });

  it('is false on the due day itself, whatever the hour', () => {
    expect(isOverdue({ status: 'IN_PROGRESS', dueDate: '2026-10-06' }, now)).toBe(false);
    // A date column arrives as UTC midnight; that is still "due today", not late.
    expect(isOverdue({ status: 'IN_PROGRESS', dueDate: new Date('2026-10-06T00:00:00Z') }, now)).toBe(false);
  });

  it('turns overdue the day after, by the stadium clock', () => {
    expect(isOverdue({ status: 'IN_PROGRESS', dueDate: '2026-10-05' }, now)).toBe(true);
    // 22:30 UTC on the 5th is already the 6th in Riyadh (UTC+3).
    const lateEvening = new Date('2026-10-05T22:30:00Z');
    expect(isOverdue({ status: 'OPEN', dueDate: '2026-10-05' }, lateEvening, 'Asia/Riyadh')).toBe(true);
    expect(isOverdue({ status: 'OPEN', dueDate: '2026-10-05' }, lateEvening, 'UTC')).toBe(false);
  });

  it('ignores an unparseable due date rather than throwing', () => {
    expect(isOverdue({ status: 'OPEN', dueDate: 'not-a-date' }, now)).toBe(false);
  });
});

describe('finding rollups', () => {
  it('computes closure rate', () => {
    expect(closureRate({ total: 8, closed: 6 })).toBe(75);
    expect(closureRate({ total: 0, closed: 0 })).toBeNull();
  });

  it('averages days to close over closed findings only', () => {
    expect(
      averageDaysToClose([
        { raisedOn: '2026-10-01', closedOn: '2026-10-03' },
        { raisedOn: '2026-10-01', closedOn: '2026-10-06' },
        { raisedOn: '2026-10-01', closedOn: null },
      ]),
    ).toBe(3.5);
  });

  it('has no average when nothing is closed', () => {
    expect(averageDaysToClose([{ raisedOn: '2026-10-01', closedOn: null }])).toBeNull();
  });
});

describe('man-hours and incident rate', () => {
  it('sums man-hours without float drift', () => {
    expect(totalManHours(['0.10', '0.20', '0.30'])).toBe('0.60');
    expect(totalManHours(['1234.56', '7890.44'])).toBe('9125.00');
  });

  it('computes incidents per 200,000 hours', () => {
    expect(incidentRate(2, '100000.00')).toBe(4);
  });

  it('suppresses the rate when exposure is below the threshold', () => {
    expect(incidentRate(1, '0.00')).toBeNull();
    expect(incidentRate(1, '50.00', 100)).toBeNull();
  });
});

describe('presentation helpers', () => {
  it('bands compliance for colour tokens', () => {
    expect(complianceBand(99)).toBe('EXCELLENT');
    expect(complianceBand(95)).toBe('EXCELLENT');
    expect(complianceBand(94.99)).toBe('GOOD');
    expect(complianceBand(70)).toBe('FAIR');
    expect(complianceBand(69.99)).toBe('POOR');
    expect(complianceBand(49.99)).toBe('CRITICAL');
    expect(complianceBand(null)).toBeNull();
  });

  it('computes deltas only when both sides exist', () => {
    expect(deltaPoints(82.5, 80)).toBe(2.5);
    expect(deltaPoints(82.5, null)).toBeNull();
  });

  it('caps coverage at 100%', () => {
    expect(coveragePercent(12, 10)).toBe(100);
    expect(coveragePercent(5, 10)).toBe(50);
    expect(coveragePercent(5, 0)).toBeNull();
  });
});
