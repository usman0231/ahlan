import {
  EOD_DAILY_STAT_FIELDS,
  type CorrectEodInput,
  type EodDailyStatField,
  type EodReport,
  type EodWorkforceEntry,
} from '@ahlan/shared';
import type {
  CorrectInspectionInput,
  InspectionResponse,
  InspectionWithResponses,
  ResponseValue,
} from '@ahlan/shared';

/**
 * Turning an administrator's edits of a submitted record into the minimal
 * correction body: only what changed is sent, so the audit log shows the
 * actual correction rather than a rewrite of every field.
 */

export interface ResponseEdit {
  value: ResponseValue;
  concern: string;
  recommendation: string;
}

export interface InspectionEdits {
  notes: string;
  locationLabel: string;
  otherObservations: string;
  responses: Record<string, ResponseEdit>;
}

const text = (value: string | null | undefined): string => value ?? '';
const orNull = (value: string): string | null => (value.trim() ? value.trim() : null);

export function inspectionEditsFrom(inspection: InspectionWithResponses): InspectionEdits {
  return {
    notes: text(inspection.notes),
    locationLabel: text(inspection.locationLabel),
    otherObservations: text(inspection.otherObservations),
    responses: Object.fromEntries(
      inspection.responses.map((response) => [
        response.id,
        {
          value: response.value,
          concern: text(response.concern ?? response.comment),
          recommendation: text(response.recommendation),
        },
      ]),
    ),
  };
}

function responseChanged(original: InspectionResponse, edit: ResponseEdit): boolean {
  return (
    edit.value !== original.value ||
    edit.concern.trim() !== text(original.concern ?? original.comment).trim() ||
    edit.recommendation.trim() !== text(original.recommendation).trim()
  );
}

/** The correction body without the reason, or null when nothing changed. */
export function inspectionCorrection(
  inspection: InspectionWithResponses,
  edits: InspectionEdits,
): Omit<CorrectInspectionInput, 'reason'> | null {
  const body: Omit<CorrectInspectionInput, 'reason'> = { responses: [] };
  let changed = false;

  if (edits.notes.trim() !== text(inspection.notes).trim()) {
    body.notes = orNull(edits.notes);
    changed = true;
  }
  if (edits.locationLabel.trim() !== text(inspection.locationLabel).trim()) {
    body.locationLabel = orNull(edits.locationLabel);
    changed = true;
  }
  if (edits.otherObservations.trim() !== text(inspection.otherObservations).trim()) {
    body.otherObservations = orNull(edits.otherObservations);
    changed = true;
  }
  for (const response of inspection.responses) {
    const edit = edits.responses[response.id];
    if (!edit || !responseChanged(response, edit)) continue;
    body.responses.push({
      id: response.id,
      value: edit.value,
      comment: response.comment,
      concern: orNull(edit.concern),
      recommendation: orNull(edit.recommendation),
      severity: response.severity,
    });
    changed = true;
  }
  return changed ? body : null;
}

/* ---------------------------------- EOD ----------------------------------- */

export const EOD_EDIT_TEXT_FIELDS = [
  'summary',
  'concerns',
  'actionsMitigation',
  'plannedTomorrow',
  'additionalRemarks',
] as const;
export type EodEditTextField = (typeof EOD_EDIT_TEXT_FIELDS)[number];

export interface EodEdits {
  workforce: EodWorkforceEntry[];
  totalSpectators: string;
  stats: Record<EodDailyStatField, string>;
  text: Record<EodEditTextField, string>;
}

const count = (value: string): number => {
  const parsed = Number.parseInt(value.replace(/\D/g, ''), 10);
  return Number.isFinite(parsed) ? parsed : 0;
};

const sameWorkforce = (a: readonly EodWorkforceEntry[], b: readonly EodWorkforceEntry[]) =>
  JSON.stringify(
    a.map(({ category, personnel, hours }) => [category, personnel, Number(hours)]),
  ) ===
  JSON.stringify(b.map(({ category, personnel, hours }) => [category, personnel, Number(hours)]));

/** The EOD correction body without the reason, or null when nothing changed. */
export function eodCorrection(
  report: EodReport,
  edits: EodEdits,
): Omit<CorrectEodInput, 'reason'> | null {
  const body: Record<string, unknown> = {};

  if (!sameWorkforce(edits.workforce, report.workforce)) {
    body.workforce = edits.workforce.map(({ category, personnel, hours }) => ({
      category,
      personnel,
      hours,
    }));
  }
  const spectators = edits.totalSpectators.trim() ? count(edits.totalSpectators) : null;
  if (spectators !== report.totalSpectators) body.totalSpectators = spectators;

  for (const field of EOD_DAILY_STAT_FIELDS) {
    const value = count(edits.stats[field]);
    if (value !== report[field]) body[field] = value;
  }
  for (const field of EOD_EDIT_TEXT_FIELDS) {
    const value = edits.text[field].trim();
    if (value !== (report[field] ?? '').trim()) body[field] = value || null;
  }
  return Object.keys(body).length > 0 ? (body as Omit<CorrectEodInput, 'reason'>) : null;
}
