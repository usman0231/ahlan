import { z } from 'zod';

import { CHECKLIST_CATEGORIES, SEVERITIES } from '../enums';
import {
  cursorQuerySchema,
  idSchema,
  isoDateSchema,
  optionalText,
  text,
  timestampSchema,
  queryBooleanSchema,
} from './common';

/**
 * Checklists are versioned. Editing one never mutates the published version; it
 * creates the next one, so a completed inspection keeps pointing at the exact
 * wording it was answered against.
 */

export const checklistItemSchema = z.object({
  id: idSchema,
  sectionId: idSchema,
  /** Stable human code shown in reports, e.g. "WAH-04". */
  code: z.string(),
  question: z.string(),
  questionAr: z.string().nullable(),
  guidance: z.string().nullable(),
  /** Severity pre-filled on the finding a NO creates; the inspector can raise it. */
  defaultSeverity: z.enum(SEVERITIES),
  allowNa: z.boolean(),
  sortOrder: z.number().int(),
});
export type ChecklistItem = z.infer<typeof checklistItemSchema>;

export const checklistSectionSchema = z.object({
  id: idSchema,
  versionId: idSchema,
  title: z.string(),
  titleAr: z.string().nullable(),
  sortOrder: z.number().int(),
  items: z.array(checklistItemSchema),
});
export type ChecklistSection = z.infer<typeof checklistSectionSchema>;

export const checklistVersionSchema = z.object({
  id: idSchema,
  checklistId: idSchema,
  version: z.number().int().positive(),
  isPublished: z.boolean(),
  publishedAt: timestampSchema.nullable(),
  createdById: idSchema.nullable(),
  itemCount: z.number().int().min(0),
  sections: z.array(checklistSectionSchema),
  createdAt: timestampSchema,
});
export type ChecklistVersion = z.infer<typeof checklistVersionSchema>;

export const checklistSchema = z.object({
  id: idSchema,
  title: z.string(),
  titleAr: z.string().nullable(),
  description: z.string().nullable(),
  /** READINESS sheets drive the daily stadium progress; DISCIPLINE ones belong to a discipline. */
  category: z.enum(CHECKLIST_CATEGORIES),
  disciplineId: idSchema.nullable(),
  /** Empty means the checklist applies to every stadium. */
  stadiumIds: z.array(idSchema),
  isActive: z.boolean(),
  currentVersion: z.number().int().positive().nullable(),
  currentVersionId: idSchema.nullable(),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
  deletedAt: timestampSchema.nullable(),
});
export type Checklist = z.infer<typeof checklistSchema>;

export const checklistWithVersionSchema = checklistSchema.extend({
  version: checklistVersionSchema.nullable(),
});
export type ChecklistWithVersion = z.infer<typeof checklistWithVersionSchema>;

/* ----------------------------- write payloads ----------------------------- */

export const checklistItemInputSchema = z.object({
  /** Optional so the admin UI can send client-generated ids for stable ordering. */
  id: idSchema.optional(),
  code: text(16, 1).transform((value) => value.toUpperCase()),
  question: text(400, 3),
  questionAr: optionalText(400),
  guidance: optionalText(1000),
  defaultSeverity: z.enum(SEVERITIES).default('MEDIUM'),
  allowNa: z.boolean().default(true),
});
export type ChecklistItemInput = z.infer<typeof checklistItemInputSchema>;

export const checklistSectionInputSchema = z.object({
  id: idSchema.optional(),
  title: text(160, 2),
  titleAr: optionalText(160),
  items: z.array(checklistItemInputSchema).min(1).max(200),
});
export type ChecklistSectionInput = z.infer<typeof checklistSectionInputSchema>;

const sectionsSchema = z
  .array(checklistSectionInputSchema)
  .min(1)
  .max(50)
  .superRefine((sections, ctx) => {
    const seen = new Set<string>();
    sections.forEach((section, sectionIndex) => {
      section.items.forEach((item, itemIndex) => {
        if (seen.has(item.code)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Duplicate item code "${item.code}"`,
            path: [sectionIndex, 'items', itemIndex, 'code'],
          });
        }
        seen.add(item.code);
      });
    });
  });

export const createChecklistSchema = z.object({
  title: text(160, 2),
  titleAr: optionalText(160),
  description: optionalText(1000),
  /** Omitted: DISCIPLINE when a discipline is set, otherwise GENERAL. */
  category: z.enum(CHECKLIST_CATEGORIES).optional(),
  disciplineId: idSchema.optional().nullable(),
  stadiumIds: z.array(idSchema).max(50).default([]),
  sections: sectionsSchema,
  /** Publish straight away, or keep the first version as a draft. */
  publish: z.boolean().default(true),
});
export type CreateChecklistInput = z.infer<typeof createChecklistSchema>;

/** Metadata-only edit: does not create a new version. */
export const updateChecklistMetaSchema = z.object({
  title: text(160, 2).optional(),
  titleAr: optionalText(160),
  description: optionalText(1000),
  category: z.enum(CHECKLIST_CATEGORIES).optional(),
  disciplineId: idSchema.optional().nullable(),
  stadiumIds: z.array(idSchema).max(50).optional(),
  isActive: z.boolean().optional(),
});
export type UpdateChecklistMetaInput = z.infer<typeof updateChecklistMetaSchema>;

/** Any change to questions goes through here and produces version N+1. */
export const createChecklistVersionSchema = z.object({
  sections: sectionsSchema,
  publish: z.boolean().default(true),
  changeNote: optionalText(500),
});
export type CreateChecklistVersionInput = z.infer<typeof createChecklistVersionSchema>;

export const listChecklistsQuerySchema = cursorQuerySchema.extend({
  disciplineId: idSchema.optional(),
  stadiumId: idSchema.optional(),
  category: z.enum(CHECKLIST_CATEGORIES).optional(),
  isActive: queryBooleanSchema.optional(),
  search: text(80).optional(),
});
export type ListChecklistsQuery = z.infer<typeof listChecklistsQuerySchema>;

/* ------------------------------- completion ------------------------------- */

export const checklistCompletionQuerySchema = z.object({
  /** Stadium-local calendar date; defaults to today. */
  date: isoDateSchema.optional(),
  stadiumId: idSchema.optional(),
  category: z.enum(CHECKLIST_CATEGORIES).optional(),
});
export type ChecklistCompletionQuery = z.infer<typeof checklistCompletionQuerySchema>;

export const CHECKLIST_COMPLETION_STATUSES = ['COMPLETED', 'PENDING'] as const;
export type ChecklistCompletionStatus = (typeof CHECKLIST_COMPLETION_STATUSES)[number];

export const checklistCompletionInspectorSchema = z.object({
  userId: idSchema,
  fullName: z.string(),
  stadiumId: idSchema,
  stadiumCode: z.string(),
  status: z.enum(CHECKLIST_COMPLETION_STATUSES),
  /** The submitted inspection that completed it, when COMPLETED. */
  inspectionId: idSchema.nullable(),
});
export type ChecklistCompletionInspector = z.infer<typeof checklistCompletionInspectorSchema>;

/**
 * Who has completed a checklist on a date. `expected` = active inspectors x the
 * assigned stadiums the checklist applies to (see `checklistCompletionFor`).
 */
export const checklistCompletionSchema = z.object({
  checklistId: idSchema,
  title: z.string(),
  titleAr: z.string().nullable(),
  category: z.enum(CHECKLIST_CATEGORIES),
  itemCount: z.number().int().min(0),
  expected: z.number().int().min(0),
  completed: z.number().int().min(0),
  pending: z.number().int().min(0),
  inspectors: z.array(checklistCompletionInspectorSchema),
});
export type ChecklistCompletion = z.infer<typeof checklistCompletionSchema>;
