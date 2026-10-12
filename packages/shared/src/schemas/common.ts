import { z } from 'zod';

import { isHourMinute, isIsoDate } from '../time';
import { isUuid } from '../ids';

/** Ids are UUID v7, often minted on the device. */
export const idSchema = z
  .string()
  .refine((value) => isUuid(value), { message: 'Must be a UUID' });

export const isoDateSchema = z
  .string()
  .refine((value) => isIsoDate(value), { message: 'Must be an ISO date (YYYY-MM-DD)' });

export const hourMinuteSchema = z
  .string()
  .refine((value) => isHourMinute(value), { message: 'Must be a 24h time (HH:mm)' });

/** Accepts an ISO string or a Date and always yields a Date. */
export const timestampSchema = z.coerce.date();

export const timeZoneSchema = z
  .string()
  .min(1)
  .max(64)
  .refine(
    (value) => {
      try {
        new Intl.DateTimeFormat('en-US', { timeZone: value });
        return true;
      } catch {
        return false;
      }
    },
    { message: 'Must be a valid IANA time zone' },
  );

/** Trimmed, non-empty text with an upper bound. */
export const text = (max: number, min = 1) =>
  z
    .string()
    .transform((value) => value.trim())
    .pipe(z.string().min(min).max(max));

export const optionalText = (max: number) =>
  z
    .string()
    .transform((value) => value.trim())
    .pipe(z.string().max(max))
    .optional()
    .nullable();

/** Man-hours and other report quantities travel as 2dp decimal strings. */
export const decimalSchema = z
  .union([z.string(), z.number()])
  .transform((value) => (typeof value === 'number' ? value.toFixed(2) : value.trim()))
  .pipe(z.string().regex(/^-?\d{1,12}(\.\d{1,2})?$/, 'Must be a decimal with up to 2dp'));

export const nonNegativeDecimalSchema = decimalSchema.refine(
  (value) => !value.startsWith('-'),
  { message: 'Must not be negative' },
);

/** GPS is mandatory on every field record for traceability. */
export const geoPointSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  /**
   * However vague, a fix is still traceability. A cell-tower fix in a
   * basement can be tens of kilometres across, and rejecting the whole
   * record over it would throw away an inspection to protect a diagnostic
   * field. The bound only rejects garbage (negative, infinite, > Earth).
   */
  accuracyM: z.number().min(0).max(40_075_000).optional().nullable(),
});
export type GeoPoint = z.infer<typeof geoPointSchema>;

/**
 * Fields every offline-created record carries so the server can reconstruct what
 * happened on the device and when.
 */
export const traceabilitySchema = z.object({
  /** Device clock at the moment of capture; may differ from the server clock. */
  clientCreatedAt: timestampSchema,
  gps: geoPointSchema.optional().nullable(),
  deviceId: z.string().max(128).optional().nullable(),
  appVersion: z.string().max(32).optional().nullable(),
});
export type Traceability = z.infer<typeof traceabilitySchema>;

export const cursorQuerySchema = z.object({
  cursor: z.string().max(128).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});
export type CursorQuery = z.infer<typeof cursorQuerySchema>;

export const sortOrderSchema = z.enum(['asc', 'desc']).default('desc');

export interface Paginated<T> {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

export const paginated = <T extends z.ZodTypeAny>(item: T) =>
  z.object({
    items: z.array(item),
    nextCursor: z.string().nullable(),
    hasMore: z.boolean(),
  });

export const dateRangeQuerySchema = z
  .object({
    from: isoDateSchema.optional(),
    to: isoDateSchema.optional(),
  })
  .refine((value) => !value.from || !value.to || value.from <= value.to, {
    message: '`from` must not be after `to`',
    path: ['from'],
  });
export type DateRangeQuery = z.infer<typeof dateRangeQuerySchema>;

export const idParamSchema = z.object({ id: idSchema });

/**
 * Boolean from a query string. `z.coerce.boolean()` is wrong here: it uses JS
 * truthiness, so the string "false" becomes `true`. Accepts true/false/1/0
 * (case-insensitive) and real booleans; anything else is a validation error.
 */
export const queryBooleanSchema = z.preprocess((value) => {
  if (typeof value !== 'string') return value;
  const normalised = value.trim().toLowerCase();
  if (normalised === 'true' || normalised === '1') return true;
  if (normalised === 'false' || normalised === '0') return false;
  return value;
}, z.boolean());
