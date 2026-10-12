/**
 * Every HSE number the product reports is derived here.
 *
 * The API recomputes all of these on submit and on report generation; a value
 * sent by a client is never trusted. The mobile app imports the same functions
 * so an offline draft shows the identical figure it will get once synced.
 */

import { SEVERITIES, type FindingStatus, type ResponseValue, type Severity } from './enums';
import { addDecimals, decimalToNumber, type DecimalLike } from './decimal';
import { DEFAULT_TIME_ZONE, daysBetween, zonedDateString, type IsoDate } from './time';

/** Percentages are reported to 2dp everywhere (UI, PDF, API). */
export const PERCENT_PRECISION = 2;

/**
 * Moves the decimal point by `exp` places through the number's decimal string.
 *
 * `value * 100` is not safe here: 1.005 is stored as 1.00499999..., so the naive
 * product lands just below the half and rounds the wrong way. Re-parsing the
 * shifted decimal literal gives the nearest double to the intended value.
 */
function shiftDecimalPoint(value: number, exp: number): number {
  const [mantissa, exponent] = value.toExponential().split('e');
  return Number(`${mantissa}e${Number(exponent) + exp}`);
}

/** Half-up rounding, away from zero on an exact half. */
export function roundTo(value: number, precision = PERCENT_PRECISION): number {
  if (!Number.isFinite(value)) return 0;
  if (value === 0) return 0;
  const scaled = shiftDecimalPoint(value, precision);
  const rounded = scaled < 0 ? -Math.round(-scaled) : Math.round(scaled);
  return shiftDecimalPoint(rounded, -precision);
}

export interface ResponseTally {
  yes: number;
  no: number;
  na: number;
}

export const EMPTY_TALLY: Readonly<ResponseTally> = Object.freeze({ yes: 0, no: 0, na: 0 });

export function tallyResponses(values: readonly ResponseValue[]): ResponseTally {
  const tally: ResponseTally = { yes: 0, no: 0, na: 0 };
  for (const value of values) {
    if (value === 'YES') tally.yes += 1;
    else if (value === 'NO') tally.no += 1;
    else tally.na += 1;
  }
  return tally;
}

export function addTallies(...tallies: ResponseTally[]): ResponseTally {
  const sum: ResponseTally = { yes: 0, no: 0, na: 0 };
  for (const tally of tallies) {
    sum.yes += tally.yes;
    sum.no += tally.no;
    sum.na += tally.na;
  }
  return sum;
}

/**
 * Compliance % = YES / (YES + NO) x 100. NA answers are excluded from both sides.
 *
 * Returns null when nothing is answerable (all NA, or no answers at all): that is
 * "no score", which is not the same as 0%.
 */
export function compliancePercent(tally: ResponseTally): number | null {
  const answerable = tally.yes + tally.no;
  if (answerable <= 0) return null;
  return roundTo((tally.yes / answerable) * 100);
}

export function compliancePercentFromResponses(values: readonly ResponseValue[]): number | null {
  return compliancePercent(tallyResponses(values));
}

/** A checklist is submittable only when every item has an answer. */
export function isChecklistComplete(answered: number, totalItems: number): boolean {
  return totalItems > 0 && answered >= totalItems;
}

/** Severity weights behind the risk index. Agreed with the HSE lead, not arbitrary. */
export const SEVERITY_WEIGHTS: Readonly<Record<Severity, number>> = Object.freeze({
  LOW: 1,
  MEDIUM: 3,
  HIGH: 7,
  CRITICAL: 15,
});

export type SeverityCounts = Record<Severity, number>;

export function emptySeverityCounts(): SeverityCounts {
  return { LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0 };
}

export function countBySeverity(severities: readonly Severity[]): SeverityCounts {
  const counts = emptySeverityCounts();
  for (const severity of severities) counts[severity] += 1;
  return counts;
}

/**
 * Weighted risk index: sum(count x weight), normalised per 100 inspected items so
 * stadiums with different inspection volumes stay comparable.
 */
export function riskIndex(counts: SeverityCounts, inspectedItems: number): number {
  if (inspectedItems <= 0) return 0;
  let weighted = 0;
  for (const severity of SEVERITIES) weighted += counts[severity] * SEVERITY_WEIGHTS[severity];
  return roundTo((weighted / inspectedItems) * 100);
}

export function isClosed(status: FindingStatus): boolean {
  return status === 'CLOSED';
}

/**
 * OVERDUE is derived, never stored: an action is overdue once its due date has
 * passed (the due day itself is still on time) and it has not been closed.
 *
 * A due date is a calendar day, stored as UTC midnight, so it is compared as a
 * day against today in the stadium's zone - comparing instants made an action
 * due today read as overdue from 03:00 Riyadh time.
 */
export function isOverdue(
  input: { status: FindingStatus; dueDate: Date | string | null | undefined },
  now: Date = new Date(),
  timeZone: string = DEFAULT_TIME_ZONE,
): boolean {
  if (!input.dueDate) return false;
  if (isClosed(input.status)) return false;
  const due = input.dueDate instanceof Date ? input.dueDate : new Date(input.dueDate);
  if (Number.isNaN(due.getTime())) return false;
  const dueDay =
    typeof input.dueDate === 'string' && /^\d{4}-\d{2}-\d{2}/.test(input.dueDate)
      ? input.dueDate.slice(0, 10)
      : due.toISOString().slice(0, 10);
  return dueDay < zonedDateString(now, timeZone);
}

export interface FindingRollup {
  total: number;
  open: number;
  closed: number;
  overdue: number;
}

/** Share of findings that reached CLOSED, 2dp. null when there are none. */
export function closureRate(rollup: Pick<FindingRollup, 'total' | 'closed'>): number | null {
  if (rollup.total <= 0) return null;
  return roundTo((rollup.closed / rollup.total) * 100);
}

/** Mean days a closed finding stayed open. */
export function averageDaysToClose(
  findings: readonly { raisedOn: IsoDate; closedOn: IsoDate | null }[],
): number | null {
  let count = 0;
  let total = 0;
  for (const finding of findings) {
    if (finding.closedOn === null) continue;
    count += 1;
    total += Math.max(0, daysBetween(finding.raisedOn, finding.closedOn));
  }
  if (count === 0) return null;
  return roundTo(total / count);
}

/** Hours worked across EOD reports, summed in fixed point. */
export function totalManHours(values: readonly DecimalLike[]): string {
  return addDecimals(...values);
}

/** Industry standard base: incidents per 200,000 exposure hours. */
export const EXPOSURE_BASE_HOURS = 200_000;

/**
 * Recordable incident rate per 200,000 man-hours. Returns null below the reporting
 * threshold, where the rate is noise rather than signal.
 */
export function incidentRate(
  recordableIncidents: number,
  manHours: DecimalLike,
  minimumHours = 1,
): number | null {
  const hours = decimalToNumber(manHours);
  if (hours <= 0 || hours < minimumHours) return null;
  return roundTo((recordableIncidents * EXPOSURE_BASE_HOURS) / hours);
}

/** Percentage-point change between two scores. */
export function deltaPoints(current: number | null, previous: number | null): number | null {
  if (current === null || previous === null) return null;
  return roundTo(current - previous);
}

/** Inspector coverage: stadium-days actually inspected vs expected. */
export function coveragePercent(inspectedDays: number, expectedDays: number): number | null {
  if (expectedDays <= 0) return null;
  return roundTo((Math.min(inspectedDays, expectedDays) / expectedDays) * 100);
}

export type ComplianceBand = 'CRITICAL' | 'POOR' | 'FAIR' | 'GOOD' | 'EXCELLENT';

/** Bands drive the colour token used on KPI cards and in PDFs. */
export function complianceBand(percent: number | null): ComplianceBand | null {
  if (percent === null) return null;
  if (percent < 50) return 'CRITICAL';
  if (percent < 70) return 'POOR';
  if (percent < 85) return 'FAIR';
  if (percent < 95) return 'GOOD';
  return 'EXCELLENT';
}
