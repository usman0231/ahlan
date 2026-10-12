import { z } from 'zod';

import { EVIDENCE_CONTEXTS, EVIDENCE_KINDS, EVIDENCE_UPLOAD_STATUSES } from '../enums';
import { geoPointSchema, idSchema, optionalText, timestampSchema } from './common';

/**
 * Photos never stream through the API. The device asks for a presigned PUT,
 * uploads straight to object storage, then tells the API the object landed.
 * The evidence id is minted on the device so a retried upload is idempotent.
 */

export const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export const ALLOWED_DOCUMENT_TYPES = ['application/pdf'] as const;

/** Matches the on-device compression target (~1600px, JPEG q0.7). */
export const MAX_EVIDENCE_BYTES = 8 * 1024 * 1024;

export const evidenceSchema = z.object({
  id: idSchema,
  kind: z.enum(EVIDENCE_KINDS),
  context: z.enum(EVIDENCE_CONTEXTS),
  /** Null until the parent record (response, observation, ...) is saved. */
  contextId: idSchema.nullable(),
  objectKey: z.string(),
  contentType: z.string(),
  sizeBytes: z.number().int().min(0),
  width: z.number().int().positive().nullable(),
  height: z.number().int().positive().nullable(),
  caption: z.string().nullable(),
  capturedAt: timestampSchema.nullable(),
  gps: geoPointSchema.nullable(),
  uploadStatus: z.enum(EVIDENCE_UPLOAD_STATUSES),
  uploadedById: idSchema,
  stadiumId: idSchema.nullable(),
  createdAt: timestampSchema,
  /** Short-lived presigned GET, added by the API when reading. */
  url: z.string().url().nullable().optional(),
  thumbnailUrl: z.string().url().nullable().optional(),
});
export type Evidence = z.infer<typeof evidenceSchema>;

export const presignEvidenceSchema = z.object({
  /** Device-generated UUID v7; re-sending the same id returns the same object key. */
  id: idSchema,
  kind: z.enum(EVIDENCE_KINDS).default('PHOTO'),
  context: z.enum(EVIDENCE_CONTEXTS),
  contextId: idSchema.optional().nullable(),
  stadiumId: idSchema,
  contentType: z
    .string()
    .refine(
      (value) =>
        (ALLOWED_IMAGE_TYPES as readonly string[]).includes(value) ||
        (ALLOWED_DOCUMENT_TYPES as readonly string[]).includes(value),
      { message: 'Unsupported content type' },
    ),
  sizeBytes: z.number().int().min(1).max(MAX_EVIDENCE_BYTES),
  width: z.number().int().positive().max(20_000).optional().nullable(),
  height: z.number().int().positive().max(20_000).optional().nullable(),
  caption: optionalText(500),
  capturedAt: timestampSchema.optional().nullable(),
  gps: geoPointSchema.optional().nullable(),
  /** SHA-256 of the file, used to detect a truncated upload. */
  checksum: z.string().regex(/^[a-f0-9]{64}$/i).optional().nullable(),
});
export type PresignEvidenceInput = z.infer<typeof presignEvidenceSchema>;

export const presignEvidenceResponseSchema = z.object({
  evidenceId: idSchema,
  objectKey: z.string(),
  uploadUrl: z.string().url(),
  /** Headers the device must replay on the PUT for the signature to match. */
  headers: z.record(z.string()),
  expiresAt: timestampSchema,
});
export type PresignEvidenceResponse = z.infer<typeof presignEvidenceResponseSchema>;

/** Called after a successful PUT; the API verifies the object really exists. */
export const completeEvidenceSchema = z.object({
  sizeBytes: z.number().int().min(1).max(MAX_EVIDENCE_BYTES).optional(),
  checksum: z.string().regex(/^[a-f0-9]{64}$/i).optional().nullable(),
});
export type CompleteEvidenceInput = z.infer<typeof completeEvidenceSchema>;

export const attachEvidenceSchema = z.object({
  context: z.enum(EVIDENCE_CONTEXTS),
  contextId: idSchema,
  evidenceIds: z.array(idSchema).min(1).max(20),
});
export type AttachEvidenceInput = z.infer<typeof attachEvidenceSchema>;
