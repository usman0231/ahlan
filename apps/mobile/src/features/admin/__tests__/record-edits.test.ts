import type { EodReport, InspectionWithResponses } from '@ahlan/shared';

import {
  eodCorrection,
  inspectionCorrection,
  inspectionEditsFrom,
  type EodEdits,
} from '../record-edits';
import { recordInvalidationKeys } from '../record-keys';

const inspection = {
  id: 'i1',
  notes: 'All fine',
  locationLabel: null,
  otherObservations: null,
  responses: [
    {
      id: 'r1',
      itemCode: 'Q-01',
      value: 'YES',
      comment: null,
      concern: null,
      recommendation: null,
      severity: null,
      evidence: [],
    },
    {
      id: 'r2',
      itemCode: 'Q-02',
      value: 'NO',
      comment: 'legacy comment',
      concern: null,
      recommendation: 'Fix it',
      severity: 'HIGH',
      evidence: [],
    },
  ],
} as unknown as InspectionWithResponses;

describe('inspectionCorrection', () => {
  it('returns null when nothing changed', () => {
    expect(inspectionCorrection(inspection, inspectionEditsFrom(inspection))).toBeNull();
  });

  it('starts from the concern, falling back to the legacy comment', () => {
    expect(inspectionEditsFrom(inspection).responses.r2!.concern).toBe('legacy comment');
  });

  it('sends only the changed fields and responses', () => {
    const edits = inspectionEditsFrom(inspection);
    edits.notes = '  ';
    edits.responses.r2 = { ...edits.responses.r2!, value: 'YES' };
    expect(inspectionCorrection(inspection, edits)).toEqual({
      notes: null,
      responses: [
        {
          id: 'r2',
          value: 'YES',
          comment: 'legacy comment',
          concern: 'legacy comment',
          recommendation: 'Fix it',
          severity: 'HIGH',
        },
      ],
    });
  });

  it('ignores whitespace-only edits', () => {
    const edits = inspectionEditsFrom(inspection);
    edits.notes = 'All fine  ';
    edits.responses.r1 = { ...edits.responses.r1!, concern: '   ' };
    expect(inspectionCorrection(inspection, edits)).toBeNull();
  });
});

describe('recordInvalidationKeys', () => {
  it('refreshes findings when an inspection or observation changes, and KPIs always', () => {
    for (const kind of ['inspections', 'observations'] as const) {
      expect(recordInvalidationKeys(kind)).toEqual(
        expect.arrayContaining([['findings'], ['kpis'], ['dashboard']]),
      );
    }
    expect(recordInvalidationKeys('eod')).toEqual(
      expect.arrayContaining([['eod'], ['eod-compliance'], ['kpis']]),
    );
  });
});

describe('eodCorrection', () => {
  const report = {
    id: 'e1',
    workforce: [{ category: 'LOC Staff', personnel: 4, hours: '8.00', manHours: '32.00' }],
    totalSpectators: null,
    workRelatedMedical: 0,
    nonWorkRelatedMedical: 1,
    firstAidCases: 0,
    fireIncidents: 0,
    otherIncidents: 0,
    hseObservationsReported: 2,
    summary: 'Quiet day on site',
    concerns: null,
    actionsMitigation: null,
    plannedTomorrow: null,
    additionalRemarks: null,
  } as unknown as EodReport;

  const unchanged = (): EodEdits => ({
    workforce: [{ category: 'LOC Staff', personnel: 4, hours: '8', manHours: '32.00' }],
    totalSpectators: '',
    stats: {
      workRelatedMedical: '0',
      nonWorkRelatedMedical: '1',
      firstAidCases: '',
      fireIncidents: '0',
      otherIncidents: '0',
      hseObservationsReported: '2',
    },
    text: {
      summary: 'Quiet day on site ',
      concerns: '',
      actionsMitigation: '',
      plannedTomorrow: '',
      additionalRemarks: '',
    },
  });

  it('returns null when nothing changed (8 and 8.00 hours are the same)', () => {
    expect(eodCorrection(report, unchanged())).toBeNull();
  });

  it('sends changed workforce without man-hours (the API recomputes them), and changed figures', () => {
    const edits = unchanged();
    edits.workforce = [{ category: 'LOC Staff', personnel: 5, hours: '8.00', manHours: '40.00' }];
    edits.totalSpectators = '41,000';
    edits.stats.firstAidCases = '3';
    edits.text.concerns = 'Crowding at gate 4';
    expect(eodCorrection(report, edits)).toEqual({
      workforce: [{ category: 'LOC Staff', personnel: 5, hours: '8.00' }],
      totalSpectators: 41000,
      firstAidCases: 3,
      concerns: 'Crowding at gate 4',
    });
  });
});
