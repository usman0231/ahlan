/**
 * Time-zone helpers.
 *
 * Everything is stored in UTC. Stadiums carry an IANA time zone and all
 * inspector-facing dates (EOD windows, "today", report day buckets) are resolved
 * in that zone, not in the device zone - an inspector travelling with a phone on
 * another zone must still see the stadium's day.
 *
 * Implemented on `Intl` so it works unchanged in Node and in Hermes.
 */

export type IsoDate = string; // YYYY-MM-DD
export type IsoDateTime = string; // ISO-8601 with offset

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function isIsoDate(value: string): boolean {
  return DATE_RE.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

export function isHourMinute(value: string): boolean {
  return TIME_RE.test(value);
}

interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string): Intl.DateTimeFormat {
  const cached = formatterCache.get(timeZone);
  if (cached) return cached;
  const created = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  formatterCache.set(timeZone, created);
  return created;
}

/** Wall-clock fields of `instant` as seen in `timeZone`. */
export function zonedParts(instant: Date, timeZone: string): ZonedParts {
  const parts = formatter(timeZone).formatToParts(instant);
  const read = (type: Intl.DateTimeFormatPartTypes): number => {
    const found = parts.find((part) => part.type === type);
    return found ? Number.parseInt(found.value, 10) : 0;
  };
  // `hour12: false` can render midnight as 24 in some ICU versions.
  const hour = read('hour') % 24;
  return {
    year: read('year'),
    month: read('month'),
    day: read('day'),
    hour,
    minute: read('minute'),
    second: read('second'),
  };
}

/** Offset of `timeZone` from UTC at `instant`, in milliseconds (east is positive). */
function offsetMs(instant: Date, timeZone: string): number {
  const p = zonedParts(instant, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  // `zonedParts` has second resolution, so compare against a truncated instant.
  return asUtc - (instant.getTime() - instant.getMilliseconds());
}

/**
 * Converts a wall-clock date/time in `timeZone` to the matching UTC instant.
 * Two passes handle DST boundaries where the first offset guess is stale.
 */
export function zonedTimeToUtc(
  date: IsoDate,
  time: string,
  timeZone: string,
): Date {
  if (!isIsoDate(date)) throw new TypeError(`Invalid date: ${date}`);
  const [hourRaw, minuteRaw] = time.split(':');
  const hour = Number.parseInt(hourRaw ?? '0', 10);
  const minute = Number.parseInt(minuteRaw ?? '0', 10);
  const [y, m, d] = date.split('-').map((part) => Number.parseInt(part, 10));
  const naive = Date.UTC(y as number, (m as number) - 1, d as number, hour, minute, 0);

  let instant = new Date(naive - offsetMs(new Date(naive), timeZone));
  instant = new Date(naive - offsetMs(instant, timeZone));
  return instant;
}

/** The `YYYY-MM-DD` the instant falls on in `timeZone`. */
/** Zone used when no stadium is in context (the tournament is in Saudi Arabia). */
export const DEFAULT_TIME_ZONE = 'Asia/Riyadh';

export function zonedDateString(instant: Date, timeZone: string): IsoDate {
  const p = zonedParts(instant, timeZone);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

/** Start of the stadium-local day, as a UTC instant. */
export function startOfZonedDay(date: IsoDate, timeZone: string): Date {
  return zonedTimeToUtc(date, '00:00', timeZone);
}

/** Exclusive end of the stadium-local day, as a UTC instant. */
export function endOfZonedDay(date: IsoDate, timeZone: string): Date {
  return startOfZonedDay(addDays(date, 1), timeZone);
}

export function addDays(date: IsoDate, days: number): IsoDate {
  const instant = new Date(`${date}T00:00:00Z`);
  instant.setUTCDate(instant.getUTCDate() + days);
  return instant.toISOString().slice(0, 10);
}

/** Whole days between two ISO dates (`to - from`). */
export function daysBetween(from: IsoDate, to: IsoDate): number {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

/** Monday-based ISO week bounds containing `date`. */
export function isoWeekRange(date: IsoDate): { start: IsoDate; end: IsoDate } {
  const instant = new Date(`${date}T00:00:00Z`);
  const weekday = (instant.getUTCDay() + 6) % 7; // Monday = 0
  const start = addDays(date, -weekday);
  return { start, end: addDays(start, 6) };
}

/** Inclusive list of ISO dates from `start` to `end`. */
export function eachDay(start: IsoDate, end: IsoDate): IsoDate[] {
  const out: IsoDate[] = [];
  for (let cursor = start; daysBetween(cursor, end) >= 0; cursor = addDays(cursor, 1)) {
    out.push(cursor);
  }
  return out;
}
