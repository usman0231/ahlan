/**
 * End-of-Day submission windows.
 *
 * An admin opens a window per date with a start and end time. Those times are
 * stadium-local wall clock, so they are resolved through the stadium's IANA zone
 * before being compared to `now`. Windows may wrap past midnight (e.g. 18:00 to
 * 02:00) for late match days.
 */

import { ERROR_CODES, type ErrorCode } from './errors';
import type { EodWindowState } from './enums';
import {
  addDays,
  isHourMinute,
  isIsoDate,
  zonedDateString,
  zonedTimeToUtc,
  type IsoDate,
} from './time';

export interface EodWindow {
  /** Stadium-local calendar date the window belongs to. */
  date: IsoDate;
  /** Stadium-local HH:mm. */
  startTime: string;
  /** Stadium-local HH:mm. End before start means the window crosses midnight. */
  endTime: string;
  enabled: boolean;
}

export interface EodWindowBounds {
  opensAt: Date;
  closesAt: Date;
  /** True when endTime <= startTime, i.e. the window runs into the next day. */
  crossesMidnight: boolean;
}

export function isValidEodWindow(window: EodWindow): boolean {
  return (
    isIsoDate(window.date) && isHourMinute(window.startTime) && isHourMinute(window.endTime)
  );
}

/** Resolves the window to absolute UTC instants for a stadium. */
export function eodWindowBounds(window: EodWindow, timeZone: string): EodWindowBounds {
  if (!isValidEodWindow(window)) {
    throw new TypeError(`Invalid EOD window: ${window.date} ${window.startTime}-${window.endTime}`);
  }
  const opensAt = zonedTimeToUtc(window.date, window.startTime, timeZone);
  let closesAt = zonedTimeToUtc(window.date, window.endTime, timeZone);
  const crossesMidnight = closesAt.getTime() <= opensAt.getTime();
  if (crossesMidnight) {
    // Same wall-clock time on the following day.
    const next = new Date(`${window.date}T00:00:00Z`);
    next.setUTCDate(next.getUTCDate() + 1);
    closesAt = zonedTimeToUtc(next.toISOString().slice(0, 10), window.endTime, timeZone);
  }
  return { opensAt, closesAt, crossesMidnight };
}

export type EodWindowCheck =
  | { open: true; bounds: EodWindowBounds }
  | { open: false; code: ErrorCode; message: string; bounds?: EodWindowBounds };

/**
 * Whether an EOD report may be submitted right now.
 * The API calls this before accepting a submission; the app calls it to enable
 * the submit button and to show a countdown.
 */
export function checkEodWindow(
  window: EodWindow | null | undefined,
  timeZone: string,
  now: Date = new Date(),
): EodWindowCheck {
  if (!window) {
    return {
      open: false,
      code: ERROR_CODES.EOD_WINDOW_CLOSED,
      message: 'No EOD submission window has been opened for this date.',
    };
  }

  if (!window.enabled) {
    return {
      open: false,
      code: ERROR_CODES.EOD_WINDOW_CLOSED,
      message: 'The EOD submission window is disabled for this date.',
    };
  }

  const bounds = eodWindowBounds(window, timeZone);
  const timestamp = now.getTime();

  if (timestamp < bounds.opensAt.getTime()) {
    return {
      open: false,
      code: ERROR_CODES.EOD_WINDOW_CLOSED,
      message: 'The EOD submission window has not opened yet.',
      bounds,
    };
  }

  if (timestamp > bounds.closesAt.getTime()) {
    return {
      open: false,
      code: ERROR_CODES.EOD_WINDOW_CLOSED,
      message: 'The EOD submission window has closed.',
      bounds,
    };
  }

  return { open: true, bounds };
}

/** Milliseconds until the window closes; 0 once closed. Drives the UI countdown. */
export function msUntilEodWindowCloses(
  window: EodWindow,
  timeZone: string,
  now: Date = new Date(),
): number {
  const bounds = eodWindowBounds(window, timeZone);
  return Math.max(0, bounds.closesAt.getTime() - now.getTime());
}

/* ------------------------- recurring default windows ------------------------ */

/** A recurring daily window: same wall-clock times every day. */
export interface EodWindowDefaultTimes {
  startTime: string;
  endTime: string;
  enabled: boolean;
}

/** Everything that can define the window for one stadium on one date. */
export interface EodWindowCandidates {
  /** Per-date row for this stadium. */
  perDateStadium?: EodWindowDefaultTimes | null;
  /** Per-date row for all stadiums. */
  perDateGlobal?: EodWindowDefaultTimes | null;
  /** Recurring default for this stadium. */
  stadiumDefault?: EodWindowDefaultTimes | null;
  /** Recurring default for all stadiums. */
  globalDefault?: EodWindowDefaultTimes | null;
}

/**
 * The window in force for a date. Order: per-date stadium row > per-date global
 * row > stadium default > global default. The first one present wins, even when
 * it is disabled - that is how an admin closes one day without touching the rest.
 */
export function resolveEodWindow(date: IsoDate, candidates: EodWindowCandidates): EodWindow | null {
  const source =
    candidates.perDateStadium ??
    candidates.perDateGlobal ??
    candidates.stadiumDefault ??
    candidates.globalDefault ??
    null;
  if (!source) return null;
  return { date, startTime: source.startTime, endTime: source.endTime, enabled: source.enabled };
}

/**
 * Whether an EOD may be submitted at `now`. The window is judged at the moment of
 * submission, not against the report date: today's window (stadium-local) is
 * checked first, then yesterday's, because a window that crosses midnight is
 * still open in the early hours of the next day.
 */
export function checkEodSubmissionWindow(
  windowFor: (date: IsoDate) => EodWindow | null,
  timeZone: string,
  now: Date = new Date(),
): EodWindowCheck {
  const today = zonedDateString(now, timeZone);
  const todayCheck = checkEodWindow(windowFor(today), timeZone, now);
  if (todayCheck.open) return todayCheck;
  const yesterdayCheck = checkEodWindow(windowFor(addDays(today, -1)), timeZone, now);
  if (yesterdayCheck.open) return yesterdayCheck;
  return todayCheck;
}

/** OPEN / CLOSED / DISABLED for a recurring default, as the admin EOD screen shows it. */
export function eodDefaultWindowState(
  windowDefault: EodWindowDefaultTimes | null | undefined,
  timeZone: string,
  now: Date = new Date(),
): { status: EodWindowState; opensAt: Date | null; closesAt: Date | null } {
  if (!windowDefault || !windowDefault.enabled) {
    return { status: 'DISABLED', opensAt: null, closesAt: null };
  }
  const check = checkEodSubmissionWindow(
    (date) => resolveEodWindow(date, { globalDefault: windowDefault }),
    timeZone,
    now,
  );
  return {
    status: check.open ? 'OPEN' : 'CLOSED',
    opensAt: check.bounds?.opensAt ?? null,
    closesAt: check.bounds?.closesAt ?? null,
  };
}

/** Report dates an inspector may submit for: today or yesterday, stadium-local. */
export function allowedEodReportDates(timeZone: string, now: Date = new Date()): IsoDate[] {
  const today = zonedDateString(now, timeZone);
  return [today, addDays(today, -1)];
}

export function isAllowedEodReportDate(
  date: IsoDate,
  timeZone: string,
  now: Date = new Date(),
): boolean {
  return allowedEodReportDates(timeZone, now).includes(date);
}
