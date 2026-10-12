import { z } from 'zod';

import { compareDecimals, divideDecimalByInt, toDecimalString } from '../decimal';
import { EOD_WINDOW_STATES, SUBMISSION_STATUSES } from '../enums';
import {
  cursorQuerySchema,
  dateRangeQuerySchema,
  geoPointSchema,
  hourMinuteSchema,
  idSchema,
  isoDateSchema,
  nonNegativeDecimalSchema,
  optionalText,
  text,
  timestampSchema,
  traceabilitySchema,
} from './common';
import { adminReasonSchema, includeDeletedQuerySchema, softDeleteFieldsSchema } from './admin';

/**
 * End-of-Day report: one per inspector, per stadium, per stadium-local day.
 * Submission is only accepted while the admin's window for that date is open.
 */

export const eodWindowSchema = z.object({
  id: idSchema,
  /** Null means the window applies to every stadium for that date. */
  stadiumId: idSchema.nullable(),
  date: isoDateSchema,
  startTime: hourMinuteSchema,
  endTime: hourMinuteSchema,
  enabled: z.boolean(),
  /** Resolved UTC instants, so the app does not have to redo the zone maths. */
  opensAt: timestampSchema.optional(),
  closesAt: timestampSchema.optional(),
  createdById: idSchema.nullable(),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
});
export type EodWindowRecord = z.infer<typeof eodWindowSchema>;

export const upsertEodWindowSchema = z.object({
  stadiumId: idSchema.optional().nullable(),
  date: isoDateSchema,
  startTime: hourMinuteSchema,
  endTime: hourMinuteSchema,
  enabled: z.boolean().default(true),
});
export type UpsertEodWindowInput = z.infer<typeof upsertEodWindowSchema>;

/** Opens the same window across a date range in one go. */
export const bulkEodWindowSchema = z
  .object({
    stadiumIds: z.array(idSchema).max(50).default([]),
    from: isoDateSchema,
    to: isoDateSchema,
    startTime: hourMinuteSchema,
    endTime: hourMinuteSchema,
    enabled: z.boolean().default(true),
  })
  .refine((value) => value.from <= value.to, {
    message: '`from` must not be after `to`',
    path: ['from'],
  });
export type BulkEodWindowInput = z.infer<typeof bulkEodWindowSchema>;

export const eodWindowStatusSchema = z.object({
  date: isoDateSchema,
  stadiumId: idSchema,
  open: z.boolean(),
  reason: z.string().nullable(),
  opensAt: timestampSchema.nullable(),
  closesAt: timestampSchema.nullable(),
  /** Already submitted today for this stadium. */
  alreadySubmitted: z.boolean(),
});
export type EodWindowStatus = z.infer<typeof eodWindowStatusSchema>;

/* ------------------------------ the report -------------------------------- */

/**
 * Rows the EOD form starts with. Labels are translated in the app
 * (`eod.workforceCategory.*`); the stored value is this English string. Custom
 * rows are allowed and any row may be deleted.
 */
export const EOD_DEFAULT_WORKFORCE_CATEGORIES = [
  'LOC Staff',
  'Contractor Staff',
  'Stewards',
  'Marshals',
  'Volunteers',
  'Catering Staff',
  'Medical Staff',
] as const;
export type EodDefaultWorkforceCategory = (typeof EOD_DEFAULT_WORKFORCE_CATEGORIES)[number];

/** Hours worked per person on a workforce row. */
export const EOD_MAX_HOURS_PER_PERSON = '24.00';

const workforceHoursSchema = nonNegativeDecimalSchema.refine(
  (value) => compareDecimals(value, EOD_MAX_HOURS_PER_PERSON) <= 0,
  { message: 'Hours must be between 0 and 24' },
);

/**
 * Maps the pre-wave-2 workforce line `{ contractor, headcount, manHours }` to the
 * current `{ category, personnel, hours }`, so reports queued offline by an older
 * build are not rejected. hours = manHours / headcount (2dp, capped at 24), or 0.
 * Anything else passes through untouched for the schema to judge.
 */
export function normalizeLegacyWorkforceEntry(raw: unknown): unknown {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return raw;
  const entry = raw as Record<string, unknown>;
  if ('category' in entry || 'personnel' in entry || 'hours' in entry) return raw;
  if (!('contractor' in entry) && !('headcount' in entry)) return raw;

  const personnel = Number(entry.headcount ?? 0);
  let hours = '0.00';
  try {
    if (Number.isInteger(personnel) && personnel > 0) {
      hours = divideDecimalByInt(toDecimalString(String(entry.manHours ?? '0')), personnel);
      if (compareDecimals(hours, EOD_MAX_HOURS_PER_PERSON) > 0) hours = EOD_MAX_HOURS_PER_PERSON;
      // Left negative on purpose: the schema then rejects it, as it always did.
    }
  } catch {
    hours = '0.00';
  }
  return {
    category: typeof entry.contractor === 'string' ? entry.contractor : '',
    personnel,
    hours,
  };
}

/**
 * One workforce row as sent by the app. `manHours` is accepted but ignored: the
 * API recomputes it as personnel x hours (`workforceManHours`).
 */
export const eodWorkforceEntryInputSchema = z.preprocess(
  normalizeLegacyWorkforceEntry,
  z.object({
    category: text(120, 1),
    personnel: z.coerce.number().int().min(0).max(100_000),
    /** 2dp decimal string, 0-24. */
    hours: workforceHoursSchema,
    manHours: nonNegativeDecimalSchema.optional(),
  }),
);
export type EodWorkforceEntryInput = z.infer<typeof eodWorkforceEntryInputSchema>;

/** A stored workforce row; `manHours` = personnel x hours, fixed point. */
export const eodWorkforceEntrySchema = z.object({
  category: z.string(),
  personnel: z.number().int().min(0),
  hours: z.string(),
  manHours: z.string(),
});
export type EodWorkforceEntry = z.infer<typeof eodWorkforceEntrySchema>;

/** Daily HSE statistics on the EOD form (all non-negative integers). */
export const EOD_DAILY_STAT_FIELDS = [
  'workRelatedMedical',
  'nonWorkRelatedMedical',
  'firstAidCases',
  'fireIncidents',
  'otherIncidents',
  'hseObservationsReported',
] as const;
export type EodDailyStatField = (typeof EOD_DAILY_STAT_FIELDS)[number];

const statCount = z.coerce.number().int().min(0).max(100_000);

export const eodReportSchema = z.object({
  id: idSchema,
  stadiumId: idSchema,
  stadiumName: z.string().optional(),
  tournamentId: idSchema.nullable(),
  inspectorId: idSchema,
  inspectorName: z.string().optional(),
  date: isoDateSchema,
  status: z.enum(SUBMISSION_STATUSES),
  totalHeadcount: z.number().int().min(0),
  totalManHours: z.string(),
  workforce: z.array(eodWorkforceEntrySchema),
  totalSpectators: z.number().int().min(0).nullable(),
  workRelatedMedical: z.number().int().min(0),
  nonWorkRelatedMedical: z.number().int().min(0),
  firstAidCases: z.number().int().min(0),
  fireIncidents: z.number().int().min(0),
  otherIncidents: z.number().int().min(0),
  hseObservationsReported: z.number().int().min(0),
  inspectionsCompleted: z.number().int().min(0),
  observationsRaised: z.number().int().min(0),
  findingsRaised: z.number().int().min(0),
  findingsClosed: z.number().int().min(0),
  /** Server-set: equals workRelatedMedical. Kept for KPIs, reports and AI. */
  recordableIncidents: z.number().int().min(0),
  nearMisses: z.number().int().min(0),
  /** Highlights & key activities. */
  summary: z.string().nullable(),
  /** Issues / risks. */
  concerns: z.string().nullable(),
  actionsMitigation: z.string().nullable(),
  /** Next 24 hours. */
  plannedTomorrow: z.string().nullable(),
  additionalRemarks: z.string().nullable(),
  weather: z.string().nullable(),
  clientCreatedAt: timestampSchema,
  submittedAt: timestampSchema.nullable(),
  serverReceivedAt: timestampSchema.nullable(),
  gps: geoPointSchema.nullable(),
  isLocked: z.boolean(),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
}).merge(softDeleteFieldsSchema);
export type EodReport = z.infer<typeof eodReportSchema>;

const eodBodySchema = z.object({
  id: idSchema,
  stadiumId: idSchema,
  /** The report date: today or yesterday in the stadium's zone (checked on submit). */
  date: isoDateSchema,
  workforce: z.array(eodWorkforceEntryInputSchema).max(100).default([]),
  totalSpectators: z.coerce.number().int().min(0).max(1_000_000).optional().nullable(),
  /** Omitted by older builds: then taken from recordableIncidents. */
  workRelatedMedical: statCount.optional(),
  nonWorkRelatedMedical: statCount.default(0),
  firstAidCases: statCount.default(0),
  fireIncidents: statCount.default(0),
  otherIncidents: statCount.default(0),
  hseObservationsReported: statCount.default(0),
  /** Legacy input. The server stores recordableIncidents = workRelatedMedical. */
  recordableIncidents: z.coerce.number().int().min(0).max(1000).default(0),
  nearMisses: z.coerce.number().int().min(0).max(1000).default(0),
  summary: optionalText(4000),
  concerns: optionalText(4000),
  actionsMitigation: optionalText(2000),
  plannedTomorrow: optionalText(4000),
  additionalRemarks: optionalText(2000),
  weather: optionalText(120),
  evidenceIds: z.array(idSchema).max(20).default([]),
});

export const saveEodDraftSchema = eodBodySchema.partial({ date: true, stadiumId: true });
export type SaveEodDraftInput = z.infer<typeof saveEodDraftSchema>;

export const submitEodSchema = traceabilitySchema.merge(eodBodySchema).extend({
  submittedAt: timestampSchema,
  summary: text(4000, 10),
});
export type SubmitEodInput = z.infer<typeof submitEodSchema>;

export const correctEodSchema = z.object({
  reason: adminReasonSchema,
  workforce: z.array(eodWorkforceEntryInputSchema).max(100).optional(),
  totalSpectators: z.coerce.number().int().min(0).max(1_000_000).optional().nullable(),
  workRelatedMedical: statCount.optional(),
  nonWorkRelatedMedical: statCount.optional(),
  firstAidCases: statCount.optional(),
  fireIncidents: statCount.optional(),
  otherIncidents: statCount.optional(),
  hseObservationsReported: statCount.optional(),
  /** Legacy: ignored when workRelatedMedical is sent. */
  recordableIncidents: z.coerce.number().int().min(0).max(1000).optional(),
  nearMisses: z.coerce.number().int().min(0).max(1000).optional(),
  summary: optionalText(4000),
  concerns: optionalText(4000),
  actionsMitigation: optionalText(2000),
  plannedTomorrow: optionalText(4000),
  additionalRemarks: optionalText(2000),
  weather: optionalText(120),
});
export type CorrectEodInput = z.infer<typeof correctEodSchema>;

export const listEodQuerySchema = cursorQuerySchema
  .extend({
    stadiumId: idSchema.optional(),
    inspectorId: idSchema.optional(),
    status: z.enum(SUBMISSION_STATUSES).optional(),
    tournamentId: idSchema.optional(),
  })
  .merge(includeDeletedQuerySchema)
  .and(dateRangeQuerySchema);
export type ListEodQuery = z.infer<typeof listEodQuerySchema>;

/** Who still owes an EOD for a date - drives the admin chase-up list. */
export const eodComplianceRowSchema = z.object({
  stadiumId: idSchema,
  stadiumName: z.string(),
  inspectorId: idSchema,
  inspectorName: z.string(),
  date: isoDateSchema,
  submitted: z.boolean(),
  submittedAt: timestampSchema.nullable(),
});
export type EodComplianceRow = z.infer<typeof eodComplianceRowSchema>;

/* --------------------------- recurring default ---------------------------- */

/** Used when no default row exists yet (the seed creates one). */
export const EOD_FALLBACK_WINDOW = { startTime: '18:00', endTime: '23:00' } as const;

/**
 * The recurring daily EOD window. `stadiumId` null is the global default.
 * Resolve order: per-date stadium row > per-date global row > stadium default >
 * global default (see `resolveEodWindow`).
 */
export const eodWindowDefaultSchema = z.object({
  id: idSchema,
  stadiumId: idSchema.nullable(),
  startTime: hourMinuteSchema,
  endTime: hourMinuteSchema,
  enabled: z.boolean(),
  updatedById: idSchema.nullable(),
  updatedAt: timestampSchema,
});
export type EodWindowDefault = z.infer<typeof eodWindowDefaultSchema>;

export const upsertEodWindowDefaultSchema = z.object({
  /** Omit (or null) for the global default every stadium uses. */
  stadiumId: idSchema.optional().nullable(),
  startTime: hourMinuteSchema,
  endTime: hourMinuteSchema,
  enabled: z.boolean().default(true),
});
export type UpsertEodWindowDefaultInput = z.infer<typeof upsertEodWindowDefaultSchema>;

export const eodWindowDefaultQuerySchema = z.object({
  stadiumId: idSchema.optional(),
});
export type EodWindowDefaultQuery = z.infer<typeof eodWindowDefaultQuerySchema>;

/** `GET /eod/window-default`: the default plus whether it is open right now. */
export const eodWindowDefaultStatusSchema = z.object({
  stadiumId: idSchema.nullable(),
  startTime: hourMinuteSchema,
  endTime: hourMinuteSchema,
  enabled: z.boolean(),
  status: z.enum(EOD_WINDOW_STATES),
  /** Zone the status was computed in (the stadium's, or Asia/Riyadh for the global default). */
  timezone: z.string(),
  opensAt: timestampSchema.nullable(),
  closesAt: timestampSchema.nullable(),
  /** Null when no default has been saved yet. */
  updatedAt: timestampSchema.nullable(),
});
export type EodWindowDefaultStatus = z.infer<typeof eodWindowDefaultStatusSchema>;
