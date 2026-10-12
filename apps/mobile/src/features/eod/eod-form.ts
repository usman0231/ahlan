import {
  EOD_DAILY_STAT_FIELDS,
  addDays,
  checkEodSubmissionWindow,
  resolveEodWindow,
  zonedDateString,
  type EodDailyStatField,
  type EodWindow,
  type EodWindowCheck,
  type EodWindowDefaultTimes,
  type IsoDate,
} from '@ahlan/shared';

import {
  defaultWorkforceRows,
  entriesToRows,
  hoursOutOfRange,
  type WorkforceRow,
} from './workforce';

/**
 * The EOD form as plain data: values, validation and window resolution, kept
 * free of React and the database so they can be unit tested.
 */

export const EOD_TEXT_FIELDS = [
  'summary',
  'concerns',
  'actionsMitigation',
  'plannedTomorrow',
  'additionalRemarks',
] as const;
export type EodTextField = (typeof EOD_TEXT_FIELDS)[number];

/** Highlights must say something on submit (same rule as the API). */
export const EOD_SUMMARY_MIN_LENGTH = 10;
export const EOD_TEXT_MAX_LENGTH = 2000;

export interface EodFormValues {
  workforce: WorkforceRow[];
  /** Digits; '' = not recorded. */
  totalSpectators: string;
  stats: Record<EodDailyStatField, string>;
  summary: string;
  concerns: string;
  actionsMitigation: string;
  plannedTomorrow: string;
  additionalRemarks: string;
}

export function emptyStats(): Record<EodDailyStatField, string> {
  return Object.fromEntries(EOD_DAILY_STAT_FIELDS.map((field) => [field, ''])) as Record<
    EodDailyStatField,
    string
  >;
}

export function emptyEodForm(): EodFormValues {
  return {
    workforce: defaultWorkforceRows(),
    totalSpectators: '',
    stats: emptyStats(),
    summary: '',
    concerns: '',
    actionsMitigation: '',
    plannedTomorrow: '',
    additionalRemarks: '',
  };
}

/** What a stored report looks like to the form (a subset of the model). */
export interface StoredEod {
  workforce: { category: string; personnel: number; hours: string; manHours: string }[];
  totalSpectators: number | null;
  workRelatedMedical: number | null;
  nonWorkRelatedMedical: number | null;
  firstAidCases: number | null;
  fireIncidents: number | null;
  otherIncidents: number | null;
  hseObservationsReported: number | null;
  /** Legacy drafts carry only this; it becomes workRelatedMedical. */
  recordableIncidents: number;
  summary: string | null;
  concerns: string | null;
  actionsMitigation: string | null;
  plannedTomorrow: string | null;
  additionalRemarks: string | null;
}

export function formFromStored(report: StoredEod): EodFormValues {
  const count = (value: number | null | undefined): string =>
    value === null || value === undefined || value === 0 ? '' : String(value);

  return {
    // A report saved with no rows at all starts from the defaults again.
    workforce: report.workforce.length > 0 ? entriesToRows(report.workforce) : defaultWorkforceRows(),
    totalSpectators: count(report.totalSpectators),
    stats: {
      workRelatedMedical: count(report.workRelatedMedical ?? report.recordableIncidents),
      nonWorkRelatedMedical: count(report.nonWorkRelatedMedical),
      firstAidCases: count(report.firstAidCases),
      fireIncidents: count(report.fireIncidents),
      otherIncidents: count(report.otherIncidents),
      hseObservationsReported: count(report.hseObservationsReported),
    },
    summary: report.summary ?? '',
    concerns: report.concerns ?? '',
    actionsMitigation: report.actionsMitigation ?? '',
    plannedTomorrow: report.plannedTomorrow ?? '',
    additionalRemarks: report.additionalRemarks ?? '',
  };
}

/** A non-negative integer from a digits-only input; blank is 0. */
export function toCount(text: string): number {
  const value = Number.parseInt(text, 10);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

export function sanitizeCountInput(text: string, maxDigits = 7): string {
  return text.replace(/\D/g, '').replace(/^0+(?=\d)/, '').slice(0, maxDigits);
}

export type EodFieldErrors = Partial<
  Record<'summary' | 'workforce', string> & Record<`hours:${string}` | `category:${string}`, string>
>;

/**
 * Submit-time checks, returned as i18n keys per field. Drafts are saved
 * whatever their state; only submit is gated.
 */
export function validateEodForm(values: EodFormValues): EodFieldErrors {
  const errors: EodFieldErrors = {};

  if (values.summary.trim().length < EOD_SUMMARY_MIN_LENGTH) {
    errors.summary = 'eod.errors.summaryTooShort';
  }

  for (const row of values.workforce) {
    if (hoursOutOfRange(row.hours)) errors[`hours:${row.key}`] = 'eod.errors.hoursRange';
    const hasNumbers = row.personnel.trim() !== '' || row.hours.trim() !== '';
    if (hasNumbers && row.category.trim() === '') {
      errors[`category:${row.key}`] = 'eod.errors.categoryRequired';
    }
  }

  return errors;
}

/* ------------------------------ the window -------------------------------- */

export interface WindowRow extends EodWindowDefaultTimes {
  stadiumId: string | null;
}

export interface DatedWindowRow extends WindowRow {
  date: IsoDate;
}

export type EodWindowStatus = 'OPEN' | 'CLOSED' | 'DISABLED' | 'NONE';

export interface ResolvedEodWindowState {
  status: EodWindowStatus;
  check: EodWindowCheck;
  /** Today's window (stadium-local), for "opens at 18:00" copy. */
  today: EodWindow | null;
  closesAt: Date | null;
  opensAt: Date | null;
}

/**
 * The window in force, evaluated on the device from synced rows, in the same
 * order the API uses: per-date stadium row > per-date global row > stadium
 * default > global default. The submission moment is what is judged (today's
 * window, or yesterday's while it runs past midnight), never the report date.
 */
export function resolveEodWindowState(input: {
  stadiumId: string;
  timeZone: string;
  perDate: readonly DatedWindowRow[];
  defaults: readonly WindowRow[];
  now?: Date;
}): ResolvedEodWindowState {
  const now = input.now ?? new Date();
  const pick = <T extends WindowRow>(rows: readonly T[], stadiumId: string | null): T | null =>
    rows.find((row) => row.stadiumId === stadiumId) ?? null;

  const stadiumDefault = pick(input.defaults, input.stadiumId);
  const globalDefault = pick(input.defaults, null);

  const windowFor = (date: IsoDate): EodWindow | null => {
    const sameDay = input.perDate.filter((row) => row.date === date);
    return resolveEodWindow(date, {
      perDateStadium: pick(sameDay, input.stadiumId),
      perDateGlobal: pick(sameDay, null),
      stadiumDefault,
      globalDefault,
    });
  };

  const check = checkEodSubmissionWindow(windowFor, input.timeZone, now);
  const todayDate = zonedDateString(now, input.timeZone);
  const today = windowFor(todayDate);

  let status: EodWindowStatus;
  if (check.open) status = 'OPEN';
  else if (!today && !windowFor(addDays(todayDate, -1))) status = 'NONE';
  else if (today && !today.enabled) status = 'DISABLED';
  else status = 'CLOSED';

  return {
    status,
    check,
    today,
    closesAt: check.open ? check.bounds.closesAt : null,
    opensAt: !check.open && check.bounds ? check.bounds.opensAt : null,
  };
}
