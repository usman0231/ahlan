import { z } from 'zod';
import { AI_INSIGHT_KINDS, SEVERITIES } from '@ahlan/shared';

/**
 * The shape the model must return.
 *
 * This is both the structured-output schema handed to the API and the validator
 * the response is checked against, so a malformed generation is rejected before
 * it can reach an admin's review queue.
 */
export const generatedInsightSchema = z.object({
  kind: z.enum(AI_INSIGHT_KINDS),
  title: z.string().min(3).max(200),
  /** Two or three sentences of prose. */
  body: z.string().min(20).max(4000),
  /** Short, specific points an HSE manager can act on. */
  bullets: z.array(z.string().min(3).max(300)).min(1).max(6),
  severity: z.enum(SEVERITIES),
  /** The model's own confidence, 0-1. */
  confidence: z.number().min(0).max(1),
});
export type GeneratedInsight = z.infer<typeof generatedInsightSchema>;

export const generatedInsightsSchema = z.object({
  insights: z.array(generatedInsightSchema).min(1).max(8),
});
export type GeneratedInsights = z.infer<typeof generatedInsightsSchema>;
