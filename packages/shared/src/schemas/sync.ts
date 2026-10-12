import { z } from 'zod';

import { idSchema } from './common';

/**
 * WatermelonDB sync protocol.
 *
 * `GET /sync/pull?lastPulledAt=` returns everything the device may see that
 * changed since that watermark; `POST /sync/push` sends local creates and
 * updates. Devices never push deletes of HSE records. The server sends the ids
 * of records an Admin soft-deleted in `deleted`, so the device drops them.
 *
 * Raw records use the device's snake_case column names, which is what
 * WatermelonDB hands us, so they are validated structurally rather than
 * field-by-field; each table's service re-validates with its own schema.
 */

export const SYNC_TABLES = [
  'stadiums',
  'disciplines',
  'tournaments',
  'checklists',
  'checklist_versions',
  'checklist_sections',
  'checklist_items',
  'inspections',
  'inspection_responses',
  'observations',
  'findings',
  'corrective_actions',
  'eod_reports',
  'eod_windows',
  'eod_window_defaults',
  'evidence',
  'users',
] as const;
export type SyncTable = (typeof SYNC_TABLES)[number];

/** Tables the device is allowed to push. Everything else is read-only on device. */
export const CLIENT_WRITABLE_TABLES = [
  'inspections',
  'inspection_responses',
  'observations',
  'eod_reports',
  'evidence',
  'corrective_actions',
] as const;
export type ClientWritableTable = (typeof CLIENT_WRITABLE_TABLES)[number];

export function isClientWritable(table: string): table is ClientWritableTable {
  return (CLIENT_WRITABLE_TABLES as readonly string[]).includes(table);
}

export const rawRecordSchema = z
  .object({ id: idSchema })
  .catchall(z.union([z.string(), z.number(), z.boolean(), z.null()]));
export type RawRecord = z.infer<typeof rawRecordSchema>;

export const tableChangeSetSchema = z.object({
  created: z.array(rawRecordSchema).max(2000).default([]),
  updated: z.array(rawRecordSchema).max(2000).default([]),
  deleted: z.array(idSchema).max(2000).default([]),
});
export type TableChangeSet = z.infer<typeof tableChangeSetSchema>;

export const syncChangesSchema = z.record(z.enum(SYNC_TABLES), tableChangeSetSchema);
export type SyncChanges = Partial<Record<SyncTable, TableChangeSet>>;

export const pullQuerySchema = z.object({
  /** Epoch ms of the previous successful pull; 0 or absent means a full sync. */
  lastPulledAt: z.coerce.number().int().min(0).default(0),
  schemaVersion: z.coerce.number().int().min(1).default(1),
  migration: z.string().optional(),
});
export type PullQuery = z.infer<typeof pullQuerySchema>;

export const pullResponseSchema = z.object({
  changes: syncChangesSchema,
  /** New watermark: the server clock at the start of the query. */
  timestamp: z.number().int(),
});
export type PullResponse = z.infer<typeof pullResponseSchema>;

export const pushBodySchema = z.object({
  lastPulledAt: z.coerce.number().int().min(0),
  changes: syncChangesSchema,
});
export type PushBody = z.infer<typeof pushBodySchema>;

/** Per-record outcome, so the device can mark exactly what failed and why. */
export const pushRejectionSchema = z.object({
  table: z.enum(SYNC_TABLES),
  id: idSchema,
  code: z.string(),
  message: z.string(),
});
export type PushRejection = z.infer<typeof pushRejectionSchema>;

export const pushResponseSchema = z.object({
  accepted: z.number().int().min(0),
  rejected: z.array(pushRejectionSchema),
  /** Server clock at the end of the push; the device stores it as its watermark. */
  timestamp: z.number().int(),
});
export type PushResponse = z.infer<typeof pushResponseSchema>;
