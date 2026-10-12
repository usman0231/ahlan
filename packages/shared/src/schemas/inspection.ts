import { z } from 'zod';

import { RESPONSE_VALUES, SEVERITIES, SUBMISSION_STATUSES } from '../enums';
import {
  cursorQuerySchema,
  dateRangeQuerySchema,
  geoPointSchema,
  idSchema,
  idParamSchema,
  isoDateSchema,
  optionalText,
  timestampSchema,
  traceabilitySchema,
} from './common';
import { evidenceSchema } from './evidence';
import { adminReasonSchema, includeDeletedQuerySchema, softDeleteFieldsSchema } from './admin';

/** Photo evidence is mandatory on a NO - that is what turns it into a finding. */
export const MIN_EVIDENCE_FOR_NO = 1;

export const inspectionResponseSchema = z.object({
  id: idSchema,
  inspectionId: idSchema,
  itemId: idSchema,
  /** Denormalised so a report never has to walk back to the checklist version. */
  itemCode: z.string(),
  value: z.enum(RESPONSE_VALUES),
  comment: z.string().nullable(),
  /** "Concern / observation" on the readiness sheet. */
  concern: z.string().nullable(),
  /** "Recommendation / action required" on the readiness sheet. */
  recommendation: z.string().nullable(),
  severity: z.enum(SEVERITIES).nullable(),
  evidence: z.array(evidenceSchema).default([]),
  answeredAt: timestampSchema,
});
export type InspectionResponse = z.infer<typeof inspectionResponseSchema>;

export const inspectionSchema = z.object({
  id: idSchema,
  stadiumId: idSchema,
  tournamentId: idSchema.nullable(),
  checklistId: idSchema,
  /** The exact version answered, frozen at submit. */
  checklistVersionId: idSchema,
  checklistVersion: z.number().int().positive(),
  checklistTitle: z.string(),
  inspectorId: idSchema,
  inspectorName: z.string().optional(),
  status: z.enum(SUBMISSION_STATUSES),
  /** Stadium-local calendar date the inspection counts towards. */
  localDate: isoDateSchema,
  startedAt: timestampSchema,
  clientCreatedAt: timestampSchema,
  submittedAt: timestampSchema.nullable(),
  /** Server clock at submit; the authoritative timestamp. */
  serverReceivedAt: timestampSchema.nullable(),
  gps: geoPointSchema.nullable(),
  yesCount: z.number().int().min(0),
  noCount: z.number().int().min(0),
  naCount: z.number().int().min(0),
  /** Recomputed by the API on submit; null when nothing is answerable. */
  compliancePercent: z.number().nullable(),
  notes: z.string().nullable(),
  /** Free-text "Location" from the readiness sheet header. */
  locationLabel: z.string().nullable(),
  /** "Other observations" - not scored. */
  otherObservations: z.string().nullable(),
  findingCount: z.number().int().min(0).default(0),
  isLocked: z.boolean(),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
}).merge(softDeleteFieldsSchema);
export type Inspection = z.infer<typeof inspectionSchema>;

export const inspectionWithResponsesSchema = inspectionSchema.extend({
  responses: z.array(inspectionResponseSchema),
});
export type InspectionWithResponses = z.infer<typeof inspectionWithResponsesSchema>;

/* ----------------------------- write payloads ----------------------------- */

const responseInputSchema = z
  .object({
    /** Device-generated id so a retried push updates instead of duplicating. */
    id: idSchema,
    itemId: idSchema,
    value: z.enum(RESPONSE_VALUES),
    comment: optionalText(1000),
    concern: optionalText(1000),
    recommendation: optionalText(1000),
    /** Overrides the item's default severity on the finding a NO creates. */
    severity: z.enum(SEVERITIES).optional().nullable(),
    /** Photos are allowed on YES and NO; at least one is required on NO. */
    evidenceIds: z.array(idSchema).max(10).default([]),
    answeredAt: timestampSchema,
  })
  .superRefine((response, ctx) => {
    if (response.value === 'NO' && response.evidenceIds.length < MIN_EVIDENCE_FOR_NO) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'A "No" answer requires at least one photo',
        path: ['evidenceIds'],
      });
    }
  });

export type InspectionResponseInput = z.infer<typeof responseInputSchema>;

/** Creating the shell: the device does this the moment the inspector taps Start. */
export const createInspectionSchema = traceabilitySchema.extend({
  id: idSchema,
  stadiumId: idSchema,
  checklistId: idSchema,
  checklistVersionId: idSchema,
  startedAt: timestampSchema,
  notes: optionalText(2000),
  locationLabel: optionalText(200),
  otherObservations: optionalText(2000),
});
export type CreateInspectionInput = z.infer<typeof createInspectionSchema>;

/** Drafts are replaced wholesale - simpler than diffing and safe to retry. */
export const saveInspectionDraftSchema = z.object({
  responses: z.array(responseInputSchema).max(1000),
  notes: optionalText(2000),
  locationLabel: optionalText(200),
  otherObservations: optionalText(2000),
});
export type SaveInspectionDraftInput = z.infer<typeof saveInspectionDraftSchema>;

/**
 * Submit carries the full answer set so an offline device can create and submit
 * in a single call once it reconnects.
 */
export const submitInspectionSchema = traceabilitySchema.extend({
  id: idSchema,
  stadiumId: idSchema,
  checklistId: idSchema,
  checklistVersionId: idSchema,
  startedAt: timestampSchema,
  submittedAt: timestampSchema,
  notes: optionalText(2000),
  locationLabel: optionalText(200),
  otherObservations: optionalText(2000),
  responses: z.array(responseInputSchema).min(1).max(1000),
});
export type SubmitInspectionInput = z.infer<typeof submitInspectionSchema>;

/**
 * Submitted inspections are immutable; this is the explicit admin override and it
 * always writes an audit log entry.
 */
export const correctInspectionSchema = z.object({
  reason: adminReasonSchema,
  notes: optionalText(2000),
  locationLabel: optionalText(200),
  otherObservations: optionalText(2000),
  responses: z
    .array(
      z.object({
        id: idSchema,
        value: z.enum(RESPONSE_VALUES),
        comment: optionalText(1000),
        concern: optionalText(1000),
        recommendation: optionalText(1000),
        severity: z.enum(SEVERITIES).optional().nullable(),
      }),
    )
    .max(1000)
    .default([]),
});
export type CorrectInspectionInput = z.infer<typeof correctInspectionSchema>;

export const listInspectionsQuerySchema = cursorQuerySchema
  .extend({
    stadiumId: idSchema.optional(),
    inspectorId: idSchema.optional(),
    checklistId: idSchema.optional(),
    status: z.enum(SUBMISSION_STATUSES).optional(),
    tournamentId: idSchema.optional(),
  })
  .merge(includeDeletedQuerySchema)
  .and(dateRangeQuerySchema);
export type ListInspectionsQuery = z.infer<typeof listInspectionsQuerySchema>;

export const inspectionIdParamSchema = idParamSchema;
