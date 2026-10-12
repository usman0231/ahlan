import { z } from 'zod';

import { AUDIT_ACTIONS } from '../enums';
import { cursorQuerySchema, dateRangeQuerySchema, idSchema, timestampSchema } from './common';

/**
 * Append-only audit trail. Every admin correction to a locked record, every
 * status change and every access decision lands here.
 */

export const auditLogSchema = z.object({
  id: idSchema,
  actorId: idSchema.nullable(),
  actorName: z.string().nullable().optional(),
  actorRole: z.string().nullable(),
  action: z.enum(AUDIT_ACTIONS),
  /** Table or domain name, e.g. "inspections". */
  entity: z.string(),
  entityId: z.string().nullable(),
  stadiumId: idSchema.nullable(),
  reason: z.string().nullable(),
  /** Only the fields that changed, as { field: { from, to } }. */
  diff: z.unknown().nullable(),
  ip: z.string().nullable(),
  userAgent: z.string().nullable(),
  createdAt: timestampSchema,
});
export type AuditLog = z.infer<typeof auditLogSchema>;

export const listAuditLogsQuerySchema = cursorQuerySchema
  .extend({
    actorId: idSchema.optional(),
    action: z.enum(AUDIT_ACTIONS).optional(),
    entity: z.string().max(64).optional(),
    entityId: z.string().max(64).optional(),
    stadiumId: idSchema.optional(),
  })
  .and(dateRangeQuerySchema);
export type ListAuditLogsQuery = z.infer<typeof listAuditLogsQuerySchema>;
