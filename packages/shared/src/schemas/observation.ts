import { z } from 'zod';

import { OBSERVATION_TYPES, RISK_RATINGS, SEVERITIES, SUBMISSION_STATUSES } from '../enums';
import {
  cursorQuerySchema,
  dateRangeQuerySchema,
  geoPointSchema,
  idSchema,
  isoDateSchema,
  optionalText,
  text,
  timestampSchema,
  traceabilitySchema,
} from './common';
import { evidenceSchema } from './evidence';
import { adminReasonSchema, includeDeletedQuerySchema, softDeleteFieldsSchema } from './admin';

/**
 * Discipline-based HSE observations: the free-form counterpart to a checklist
 * inspection. An unsafe act or condition raises a finding the same way a NO does.
 */

export const observationSchema = z.object({
  id: idSchema,
  stadiumId: idSchema,
  tournamentId: idSchema.nullable(),
  disciplineId: idSchema,
  disciplineName: z.string().optional(),
  inspectorId: idSchema,
  inspectorName: z.string().optional(),
  type: z.enum(OBSERVATION_TYPES),
  severity: z.enum(SEVERITIES),
  riskRating: z.enum(RISK_RATINGS),
  title: z.string(),
  description: z.string(),
  locationLabel: z.string().nullable(),
  /** Contractor or party responsible, free text: the list changes per tournament. */
  responsibleParty: z.string().nullable(),
  immediateAction: z.string().nullable(),
  status: z.enum(SUBMISSION_STATUSES),
  localDate: isoDateSchema,
  observedAt: timestampSchema,
  clientCreatedAt: timestampSchema,
  submittedAt: timestampSchema.nullable(),
  serverReceivedAt: timestampSchema.nullable(),
  gps: geoPointSchema.nullable(),
  evidence: z.array(evidenceSchema).default([]),
  findingId: idSchema.nullable(),
  isLocked: z.boolean(),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
}).merge(softDeleteFieldsSchema);
export type Observation = z.infer<typeof observationSchema>;

/** Positive observations are praise, so they need no photo and raise no finding. */
export const OBSERVATION_TYPES_RAISING_FINDINGS = [
  'UNSAFE_ACT',
  'UNSAFE_CONDITION',
  'NEAR_MISS',
] as const;

export function observationRaisesFinding(type: (typeof OBSERVATION_TYPES)[number]): boolean {
  return (OBSERVATION_TYPES_RAISING_FINDINGS as readonly string[]).includes(type);
}

const observationBodySchema = traceabilitySchema
  .extend({
    id: idSchema,
    stadiumId: idSchema,
    disciplineId: idSchema,
    type: z.enum(OBSERVATION_TYPES),
    severity: z.enum(SEVERITIES).default('MEDIUM'),
    riskRating: z.enum(RISK_RATINGS).default('MODERATE'),
    title: text(160, 3),
    description: text(4000, 10),
    locationLabel: optionalText(160),
    responsibleParty: optionalText(160),
    immediateAction: optionalText(2000),
    observedAt: timestampSchema,
    evidenceIds: z.array(idSchema).max(20).default([]),
  })
  .superRefine((observation, ctx) => {
    if (observationRaisesFinding(observation.type) && observation.evidenceIds.length < 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'This observation type requires at least one photo',
        path: ['evidenceIds'],
      });
    }
  });

export const createObservationSchema = observationBodySchema;
export type CreateObservationInput = z.infer<typeof createObservationSchema>;

export const submitObservationSchema = observationBodySchema;
export type SubmitObservationInput = z.infer<typeof submitObservationSchema>;

/** Drafts may be incomplete, so the photo rule is not enforced here. */
export const saveObservationDraftSchema = z.object({
  disciplineId: idSchema.optional(),
  type: z.enum(OBSERVATION_TYPES).optional(),
  severity: z.enum(SEVERITIES).optional(),
  riskRating: z.enum(RISK_RATINGS).optional(),
  title: optionalText(160),
  description: optionalText(4000),
  locationLabel: optionalText(160),
  responsibleParty: optionalText(160),
  immediateAction: optionalText(2000),
  evidenceIds: z.array(idSchema).max(20).optional(),
});
export type SaveObservationDraftInput = z.infer<typeof saveObservationDraftSchema>;

/**
 * Admin correction of a submitted observation. `type` may only change within
 * the same group (raises a finding / positive), so the linked finding stays valid.
 */
export const correctObservationSchema = z.object({
  reason: adminReasonSchema,
  type: z.enum(OBSERVATION_TYPES).optional(),
  disciplineId: idSchema.optional(),
  severity: z.enum(SEVERITIES).optional(),
  riskRating: z.enum(RISK_RATINGS).optional(),
  title: text(160, 3).optional(),
  description: text(4000, 10).optional(),
  locationLabel: optionalText(160),
  responsibleParty: optionalText(160),
  immediateAction: optionalText(2000),
  observedAt: timestampSchema.optional(),
});
export type CorrectObservationInput = z.infer<typeof correctObservationSchema>;

export const listObservationsQuerySchema = cursorQuerySchema
  .extend({
    stadiumId: idSchema.optional(),
    disciplineId: idSchema.optional(),
    inspectorId: idSchema.optional(),
    type: z.enum(OBSERVATION_TYPES).optional(),
    severity: z.enum(SEVERITIES).optional(),
    status: z.enum(SUBMISSION_STATUSES).optional(),
    tournamentId: idSchema.optional(),
  })
  .merge(includeDeletedQuerySchema)
  .and(dateRangeQuerySchema);
export type ListObservationsQuery = z.infer<typeof listObservationsQuerySchema>;
