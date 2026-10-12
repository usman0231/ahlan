/**
 * End-of-Day report arithmetic. The app shows these figures while the inspector
 * types; the API recomputes them on save and submit and never trusts the device.
 */

import { addDecimals, multiplyDecimalByInt, type DecimalLike } from './decimal';

export interface WorkforceLine {
  personnel: number;
  /** Hours per person, 2dp decimal string. */
  hours: DecimalLike;
}

/** Man-hours for one row = personnel x hours, in fixed point (2dp string). */
export function workforceManHours(line: WorkforceLine): string {
  const personnel = Number.isInteger(line.personnel) && line.personnel > 0 ? line.personnel : 0;
  return multiplyDecimalByInt(line.hours, personnel);
}

export interface WorkforceTotals {
  /** Sum of personnel. */
  totalHeadcount: number;
  /** Sum of row man-hours, 2dp string. */
  totalManHours: string;
}

export function eodWorkforceTotals(lines: readonly WorkforceLine[]): WorkforceTotals {
  let totalHeadcount = 0;
  const manHours: string[] = [];
  for (const line of lines) {
    const personnel = Number.isInteger(line.personnel) && line.personnel > 0 ? line.personnel : 0;
    totalHeadcount += personnel;
    manHours.push(workforceManHours(line));
  }
  return {
    totalHeadcount,
    totalManHours: manHours.length === 0 ? '0.00' : addDecimals(...manHours),
  };
}

/**
 * `recordableIncidents` is no longer on the form: the server stores it equal to
 * `workRelatedMedical`, so KPIs, reports and AI keep reading the same column.
 * A report from an older build only carries `recordableIncidents`; then that
 * value becomes `workRelatedMedical` too.
 */
export function resolveEodIncidentStats(input: {
  workRelatedMedical?: number | null;
  recordableIncidents?: number | null;
}): { workRelatedMedical: number; recordableIncidents: number } {
  const workRelatedMedical = input.workRelatedMedical ?? input.recordableIncidents ?? 0;
  return { workRelatedMedical, recordableIncidents: workRelatedMedical };
}
