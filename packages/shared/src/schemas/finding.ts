import { z } from 'zod';

import { FINDING_STATUSES, SEVERITIES } from '../enums';
import {
  cursorQuerySchema,
  dateRangeQuerySchema,
  idSchema,
  isoDateSchema,
  optionalText,
  text,
  timestampSchema,
  queryBooleanSchema,
} from './common';
import { evidenceSchema } from './evidence';
import { adminReasonSchema, includeDeletedQuerySchema, softDeleteFieldsSchema } from './admin';

/**
 * Findings are raised automatically: by a NO answer on an inspection, or by an
 * unsafe observation. They are never hard-deleted; an Admin may soft-delete
 * (and restore) one with an audited reason, which also hides its actions.
 */

export const findingSourceSchema = z.enum(['INSPECTION', 'OBSERVATION', 'MANUAL']);
export type FindingSource = z.infer<typeof findingSourceSchema>;

export const correctiveActionSchema = z.object({
  id: idSchema,
  findingId: idSchema,
  assigneeId: idSchema.nullable(),
  assigneeName: z.string().nullable().optional(),
  /** Party outside the app (contractor) when there is no user to assign to. */
  responsibleParty: z.string().nullable(),
  action: z.string(),
  dueDate: isoDateSchema.nullable(),
  status: z.enum(FINDING_STATUSES),
  /** Derived from dueDate + status, never stored. */
  isOverdue: z.boolean(),
  startedAt: timestampSchema.nullable(),
  completedAt: timestampSchema.nullable(),
  verifiedAt: timestampSchema.nullable(),
  verifiedById: idSchema.nullable(),
  closureNote: z.string().nullable(),
  evidence: z.array(evidenceSchema).default([]),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
});
export type CorrectiveAction = z.infer<typeof correctiveActionSchema>;

export const findingSchema = z.object({
  id: idSchema,
  reference: z.string(),
  stadiumId: idSchema,
  stadiumName: z.string().optional(),
  tournamentId: idSchema.nullable(),
  disciplineId: idSchema.nullable(),
  source: findingSourceSchema,
  inspectionId: idSchema.nullable(),
  inspectionResponseId: idSchema.nullable(),
  observationId: idSchema.nullable(),
  raisedById: idSchema,
  raisedByName: z.string().optional(),
  title: z.string(),
  description: z.string(),
  severity: z.enum(SEVERITIES),
  status: z.enum(FINDING_STATUSES),
  /** Derived: status is not CLOSED and the action's due date has passed. */
  isOverdue: z.boolean(),
  localDate: isoDateSchema,
  raisedAt: timestampSchema,
  closedAt: timestampSchema.nullable(),
  evidence: z.array(evidenceSchema).default([]),
  actions: z.array(correctiveActionSchema).default([]),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
}).merge(softDeleteFieldsSchema);
export type Finding = z.infer<typeof findingSchema>;

/* ----------------------------- write payloads ----------------------------- */

/** Admin-raised finding, outside an inspection or observation. */
export const createFindingSchema = z.object({
  id: idSchema.optional(),
  stadiumId: idSchema,
  disciplineId: idSchema.optional().nullable(),
  title: text(160, 3),
  description: text(4000, 10),
  severity: z.enum(SEVERITIES).default('MEDIUM'),
  evidenceIds: z.array(idSchema).max(20).default([]),
});
export type CreateFindingInput = z.infer<typeof createFindingSchema>;

export const updateFindingSchema = z.object({
  title: text(160, 3).optional(),
  description: text(4000, 10).optional(),
  severity: z.enum(SEVERITIES).optional(),
  disciplineId: idSchema.optional().nullable(),
  reason: adminReasonSchema,
});
export type UpdateFindingInput = z.infer<typeof updateFindingSchema>;

/** Assigning an action moves the finding OPEN -> ACTION_ASSIGNED. */
export const assignCorrectiveActionSchema = z
  .object({
    id: idSchema.optional(),
    assigneeId: idSchema.optional().nullable(),
    responsibleParty: optionalText(160),
    action: text(2000, 5),
    dueDate: isoDateSchema,
  })
  .refine((value) => Boolean(value.assigneeId) || Boolean(value.responsibleParty), {
    message: 'Provide an assignee or a responsible party',
    path: ['assigneeId'],
  });
export type AssignCorrectiveActionInput = z.infer<typeof assignCorrectiveActionSchema>;

export const updateCorrectiveActionSchema = z.object({
  assigneeId: idSchema.optional().nullable(),
  responsibleParty: optionalText(160),
  action: text(2000, 5).optional(),
  dueDate: isoDateSchema.optional(),
  /** Optional note for the audit trail (admin edits). */
  reason: adminReasonSchema.optional(),
});
export type UpdateCorrectiveActionInput = z.infer<typeof updateCorrectiveActionSchema>;

/**
 * The single entry point for every status move. The server re-checks the
 * transition with `checkTransition`, including the closure-evidence rule.
 */
export const transitionCorrectiveActionSchema = z.object({
  to: z.enum(FINDING_STATUSES),
  note: optionalText(1000),
  /** Required when closing; these become the closure evidence. */
  evidenceIds: z.array(idSchema).max(20).default([]),
});
export type TransitionCorrectiveActionInput = z.infer<typeof transitionCorrectiveActionSchema>;

export const listFindingsQuerySchema = cursorQuerySchema
  .extend({
    stadiumId: idSchema.optional(),
    disciplineId: idSchema.optional(),
    severity: z.enum(SEVERITIES).optional(),
    status: z.enum(FINDING_STATUSES).optional(),
    source: findingSourceSchema.optional(),
    assigneeId: idSchema.optional(),
    raisedById: idSchema.optional(),
    tournamentId: idSchema.optional(),
    /** Filters on the derived overdue flag rather than on a stored status. */
    overdueOnly: queryBooleanSchema.optional(),
    search: text(80).optional(),
  })
  .merge(includeDeletedQuerySchema)
  .and(dateRangeQuerySchema);
export type ListFindingsQuery = z.infer<typeof listFindingsQuerySchema>;
