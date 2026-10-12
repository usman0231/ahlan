import { z } from 'zod';

import { queryBooleanSchema, text, timestampSchema } from './common';

/**
 * Admin-only write payloads shared by several resources (wave 3).
 *
 * HSE records are never hard-deleted. An Admin may soft-delete and restore them,
 * always with a reason that lands in `audit_logs`.
 */

/** Reason attached to every admin edit, delete and restore. */
export const adminReasonSchema = text(500, 5);

/** Body of `DELETE /{inspections|observations|findings|eod}/:id`. */
export const softDeleteRecordSchema = z.object({ reason: adminReasonSchema });
export type SoftDeleteRecordInput = z.infer<typeof softDeleteRecordSchema>;

/** Body of `POST /{inspections|observations|findings|eod}/:id/restore`. */
export const restoreRecordSchema = z.object({ reason: adminReasonSchema });
export type RestoreRecordInput = z.infer<typeof restoreRecordSchema>;

/** Optional body for catalog / report / AI deletes; the audit row uses it when present. */
export const optionalReasonSchema = z
  .object({ reason: adminReasonSchema.optional() })
  .default({});
export type OptionalReasonInput = z.infer<typeof optionalReasonSchema>;

/** Fields every soft-deletable HSE record DTO carries. */
export const softDeleteFieldsSchema = z.object({
  deletedAt: timestampSchema.nullable().optional(),
  deleteReason: z.string().nullable().optional(),
});
export type SoftDeleteFields = z.infer<typeof softDeleteFieldsSchema>;

/** Admin list flag: include soft-deleted rows. Ignored for every other role. */
export const includeDeletedQuerySchema = z.object({
  includeDeleted: queryBooleanSchema.optional(),
});
export type IncludeDeletedQuery = z.infer<typeof includeDeletedQuerySchema>;

/* ------------------------------ stadium photo ------------------------------ */

export const STADIUM_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export type StadiumImageType = (typeof STADIUM_IMAGE_TYPES)[number];
export const MAX_STADIUM_IMAGE_BYTES = 8 * 1024 * 1024;

export const presignStadiumImageSchema = z.object({
  contentType: z.enum(STADIUM_IMAGE_TYPES),
  sizeBytes: z.number().int().min(1).max(MAX_STADIUM_IMAGE_BYTES),
});
export type PresignStadiumImageInput = z.infer<typeof presignStadiumImageSchema>;

export const presignStadiumImageResponseSchema = z.object({
  uploadUrl: z.string().url(),
  /** Replay these on the PUT or the signature will not match. */
  headers: z.record(z.string()),
  objectKey: z.string(),
  expiresAt: timestampSchema,
});
export type PresignStadiumImageResponse = z.infer<typeof presignStadiumImageResponseSchema>;

/** Called after the PUT landed; the API HEADs the object before trusting it. */
export const attachStadiumImageSchema = z.object({
  objectKey: z.string().min(1).max(256),
});
export type AttachStadiumImageInput = z.infer<typeof attachStadiumImageSchema>;
