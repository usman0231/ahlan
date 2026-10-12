import { zonedDateString } from '@ahlan/shared';

/**
 * Prisma maps `@db.Date` to a `Date` at UTC midnight. These helpers keep that
 * conversion in one place so a stadium-local day never shifts by a time zone on
 * the way in or out of the database.
 */

/** `YYYY-MM-DD` -> the Date Prisma expects for a `@db.Date` column. */
export function toDateColumn(isoDate: string): Date {
  return new Date(`${isoDate}T00:00:00.000Z`);
}

/** A `@db.Date` column -> `YYYY-MM-DD`. */
export function fromDateColumn(value: Date): string {
  return value.toISOString().slice(0, 10);
}

/** The stadium-local calendar day an instant belongs to. */
export function localDateFor(instant: Date, timezone: string): string {
  return zonedDateString(instant, timezone);
}
