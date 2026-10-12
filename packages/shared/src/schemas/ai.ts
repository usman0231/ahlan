import { z } from 'zod';

import { AI_INSIGHT_KINDS, AI_REVIEW_STATUSES, JOB_STATUSES, SEVERITIES } from '../enums';
import {
  cursorQuerySchema,
  idSchema,
  isoDateSchema,
  optionalText,
  text,
  timestampSchema,
} from './common';

/**
 * AI Intelligence.
 *
 * Rules the implementation must keep: the model only ever sees aggregated figures
 * from our own database, generation happens in a worker, output is stored and
 * labelled as AI-generated, and an admin has to approve an insight before it can
 * appear in an official report. No provider keys ever reach the device.
 */

export const aiInsightSchema = z.object({
  id: idSchema,
  kind: z.enum(AI_INSIGHT_KINDS),
  tournamentId: idSchema,
  stadiumId: idSchema.nullable(),
  periodStart: isoDateSchema,
  periodEnd: isoDateSchema,
  title: z.string(),
  /** Markdown body, always rendered behind an "AI-generated" label. */
  body: z.string(),
  bullets: z.array(z.string()),
  severity: z.enum(SEVERITIES).nullable(),
  confidence: z.number().min(0).max(1).nullable(),
  /** The aggregate figures the model was given, kept for auditability. */
  inputSnapshot: z.unknown().nullable(),
  model: z.string(),
  promptVersion: z.string(),
  reviewStatus: z.enum(AI_REVIEW_STATUSES),
  reviewedById: idSchema.nullable(),
  reviewedAt: timestampSchema.nullable(),
  reviewNote: z.string().nullable(),
  /** Always true in the response; the UI must not be able to forget the label. */
  isAiGenerated: z.literal(true),
  createdAt: timestampSchema,
});
export type AiInsight = z.infer<typeof aiInsightSchema>;

export const requestAiInsightsSchema = z.object({
  kinds: z.array(z.enum(AI_INSIGHT_KINDS)).min(1).default(['TREND_SUMMARY']),
  tournamentId: idSchema.optional(),
  stadiumId: idSchema.optional().nullable(),
  periodStart: isoDateSchema,
  periodEnd: isoDateSchema,
  locale: z.enum(['en', 'ar']).default('en'),
});
export type RequestAiInsightsInput = z.infer<typeof requestAiInsightsSchema>;

export const reviewAiInsightSchema = z
  .object({
    decision: z.enum(['APPROVED', 'REJECTED']),
    note: optionalText(1000),
    /** An admin may correct wording before approving. */
    editedTitle: text(200, 3).optional(),
    editedBody: text(8000, 10).optional(),
  })
  .refine((value) => value.decision !== 'REJECTED' || Boolean(value.note), {
    message: 'A rejection needs a note',
    path: ['note'],
  });
export type ReviewAiInsightInput = z.infer<typeof reviewAiInsightSchema>;

export const listAiInsightsQuerySchema = cursorQuerySchema.extend({
  kind: z.enum(AI_INSIGHT_KINDS).optional(),
  reviewStatus: z.enum(AI_REVIEW_STATUSES).optional(),
  stadiumId: idSchema.optional(),
  tournamentId: idSchema.optional(),
});
export type ListAiInsightsQuery = z.infer<typeof listAiInsightsQuerySchema>;

export const aiJobSchema = z.object({
  id: idSchema,
  status: z.enum(JOB_STATUSES),
  insightIds: z.array(idSchema),
  error: z.string().nullable(),
  createdAt: timestampSchema,
  completedAt: timestampSchema.nullable(),
});
export type AiJob = z.infer<typeof aiJobSchema>;
