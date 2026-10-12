import { addDays, type IsoDate } from '@ahlan/shared';

/**
 * The administrator's EOD submission window form (start, end, enabled), kept
 * free of React so the rules are unit tested.
 *
 * Times are 24-hour `HH:mm` strings, the same shape the API and the shared
 * window rules use. An end before the start is legal: the window crosses
 * midnight (e.g. 20:00 → 01:00), which the shared `checkEodSubmissionWindow`
 * already understands, so the form only explains it rather than refusing it.
 */

export interface EodWindowFormValues {
  startTime: string;
  endTime: string;
  enabled: boolean;
}

export type EodWindowFormErrors = Partial<Record<'startTime' | 'endTime', string>>;

const HH_MM = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** Parses `HH:mm` (24-hour). Returns null for anything else. */
export function parseHourMinute(value: string): { hour: number; minute: number } | null {
  const match = HH_MM.exec(value.trim());
  if (!match) return null;
  return { hour: Number(match[1]), minute: Number(match[2]) };
}

export function formatHourMinute(hour: number, minute: number): string {
  const h = ((Math.trunc(hour) % 24) + 24) % 24;
  const m = ((Math.trunc(minute) % 60) + 60) % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function toMinutes(value: string): number | null {
  const parsed = parseHourMinute(value);
  return parsed ? parsed.hour * 60 + parsed.minute : null;
}

/** True when the window runs past midnight (end earlier than start). */
export function crossesMidnight(startTime: string, endTime: string): boolean {
  const start = toMinutes(startTime);
  const end = toMinutes(endTime);
  return start !== null && end !== null && end < start;
}

/** Length of the window in minutes, wrapping past midnight; null when invalid. */
export function windowDurationMinutes(startTime: string, endTime: string): number | null {
  const start = toMinutes(startTime);
  const end = toMinutes(endTime);
  if (start === null || end === null || start === end) return null;
  return end > start ? end - start : 24 * 60 - start + end;
}

/** i18n keys of what is wrong; an empty object means the form can be saved. */
export function validateEodWindowForm(values: EodWindowFormValues): EodWindowFormErrors {
  const errors: EodWindowFormErrors = {};
  if (!parseHourMinute(values.startTime)) errors.startTime = 'admin.eodWindow.errors.time';
  if (!parseHourMinute(values.endTime)) errors.endTime = 'admin.eodWindow.errors.time';
  if (!errors.startTime && !errors.endTime && values.startTime.trim() === values.endTime.trim()) {
    errors.endTime = 'admin.eodWindow.errors.same';
  }
  return errors;
}

export function isEodWindowDirty(
  saved: EodWindowFormValues | null | undefined,
  form: EodWindowFormValues,
): boolean {
  if (!saved) return true;
  return (
    saved.startTime !== form.startTime.trim() ||
    saved.endTime !== form.endTime.trim() ||
    saved.enabled !== form.enabled
  );
}

/** "8h", "4h 30m", "45m" - compact, unit letters are the same in en and ar UI. */
export function formatDuration(minutes: number): { hours: number; minutes: number } {
  return { hours: Math.floor(minutes / 60), minutes: minutes % 60 };
}

/* ------------------------------ list filters ------------------------------ */

export type EodRangePreset = 'today' | '7' | '30' | 'all';

/** The `from`/`to` the submitted-EOD list asks the API for. */
export function eodRangeFor(
  preset: EodRangePreset,
  today: IsoDate,
): { from?: IsoDate; to?: IsoDate } {
  switch (preset) {
    case 'today':
      return { from: today, to: today };
    case '7':
      return { from: addDays(today, -6), to: today };
    case '30':
      return { from: addDays(today, -29), to: today };
    default:
      return {};
  }
}

/**
 * The zone the review workspace counts "today" in when no stadium is chosen:
 * the API's global default (every tournament venue is in Asia/Riyadh).
 */
export const REVIEW_TIMEZONE = 'Asia/Riyadh';
