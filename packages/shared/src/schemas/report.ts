import { z } from 'zod';

import { JOB_STATUSES, REPORT_SCOPES, REPORT_TYPES } from '../enums';
import {
  cursorQuerySchema,
  idSchema,
  isoDateSchema,
  optionalText,
  timestampSchema,
} from './common';

/**
 * Reports are produced by a BullMQ worker and stored as PDFs in object storage.
 * An HTTP request only ever enqueues a job or hands back a presigned download.
 */

export const reportSchema = z.object({
  id: idSchema,
  type: z.enum(REPORT_TYPES),
  scope: z.enum(REPORT_SCOPES),
  /** Null for a consolidated report. */
  stadiumId: idSchema.nullable(),
  stadiumName: z.string().nullable().optional(),
  tournamentId: idSchema,
  periodStart: isoDateSchema,
  periodEnd: isoDateSchema,
  status: z.enum(JOB_STATUSES),
  /** Populated once the worker finishes. */
  objectKey: z.string().nullable(),
  fileName: z.string().nullable(),
  sizeBytes: z.number().int().nullable(),
  pageCount: z.number().int().nullable(),
  /** Short-lived presigned GET, added when reading. */
  downloadUrl: z.string().url().nullable().optional(),
  includeAiInsights: z.boolean(),
  requestedById: idSchema,
  error: z.string().nullable(),
  startedAt: timestampSchema.nullable(),
  completedAt: timestampSchema.nullable(),
  createdAt: timestampSchema,
});
export type Report = z.infer<typeof reportSchema>;

export const requestReportSchema = z
  .object({
    type: z.enum(REPORT_TYPES),
    scope: z.enum(REPORT_SCOPES).default('CONSOLIDATED'),
    stadiumId: idSchema.optional().nullable(),
    tournamentId: idSchema.optional(),
    /**
     * WEEKLY: any date inside the target week.
     * CUMULATIVE: the end date; the start is the tournament start.
     * END_OF_TOURNAMENT: ignored, the tournament dates are used.
     */
    asOfDate: isoDateSchema.optional(),
    includeAiInsights: z.boolean().default(false),
    locale: z.enum(['en', 'ar']).default('en'),
    note: optionalText(500),
  })
  .refine((value) => value.scope !== 'STADIUM' || Boolean(value.stadiumId), {
    message: 'A stadium report needs stadiumId',
    path: ['stadiumId'],
  });
export type RequestReportInput = z.infer<typeof requestReportSchema>;

export const listReportsQuerySchema = cursorQuerySchema.extend({
  type: z.enum(REPORT_TYPES).optional(),
  scope: z.enum(REPORT_SCOPES).optional(),
  stadiumId: idSchema.optional(),
  status: z.enum(JOB_STATUSES).optional(),
  tournamentId: idSchema.optional(),
});
export type ListReportsQuery = z.infer<typeof listReportsQuerySchema>;

/** Resolved reporting period for a request; computed server-side. */
export const reportPeriodSchema = z.object({
  type: z.enum(REPORT_TYPES),
  periodStart: isoDateSchema,
  periodEnd: isoDateSchema,
  label: z.string(),
});
export type ReportPeriod = z.infer<typeof reportPeriodSchema>;
