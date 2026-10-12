import { Prisma } from '@prisma/client';

/**
 * Soft delete of HSE records, enforced in ONE place.
 *
 * HSE records (inspections, observations, findings, EOD reports) are never
 * hard-deleted. An admin may soft-delete one (`deletedAt`, `deletedById`,
 * `deleteReason`) and restore it later, always audited. A soft-deleted record
 * must vanish from every read: lists, details, KPIs, stadium cards, checklist
 * completion, discipline dashboards, report PDFs, the AI snapshot, reminders
 * and sync pull.
 *
 * Rather than trusting every query to remember `deletedAt: null`, this Prisma
 * client extension adds it to every read of those models (and hides children
 * whose parent is deleted: a finding's corrective actions, an inspection's
 * responses). `PrismaService` installs it, so it also applies inside
 * `$transaction(async (tx) => ...)`.
 *
 * Opting out is explicit: a `where` that names `deletedAt` itself (even as
 * `undefined`, see `INCLUDING_DELETED` / `deletedAtFilter`) is left untouched.
 * That is how admin `includeDeleted` lists, restore and the sync "deleted"
 * feed read deleted rows.
 *
 * What an extension cannot see - nested `include`/`select` of a relation and
 * relation filters started from another model - is covered by `LIVE` in the
 * few places that do it (see the grep list in soft-delete.spec.ts).
 */

export const SOFT_DELETE_MODELS = ['Inspection', 'Observation', 'Finding', 'EodReport'] as const;
export type SoftDeleteModel = (typeof SOFT_DELETE_MODELS)[number];

/** Children that disappear with their (soft-deleted) parent: model -> relation field. */
export const SOFT_DELETE_CHILDREN: Readonly<Record<string, string>> = {
  CorrectiveAction: 'finding',
  InspectionResponse: 'inspection',
};

const READ_OPERATIONS = new Set([
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'findUnique',
  'findUniqueOrThrow',
  'count',
  'aggregate',
  'groupBy',
]);

/** Filter fragment for a live (not soft-deleted) row; use in nested includes/relation filters. */
export const LIVE = { deletedAt: null } as const;

/**
 * Spread into a `where` to read soft-deleted rows too. Prisma ignores an
 * `undefined` value, but the key's presence switches the extension off.
 */
export const INCLUDING_DELETED = { deletedAt: undefined } as { deletedAt?: null };

/** `includeDeleted` list flag -> where fragment. Callers decide who may set it (admins only). */
export function deletedAtFilter(includeDeleted: boolean | undefined): { deletedAt?: null } {
  return includeDeleted ? INCLUDING_DELETED : LIVE;
}

/** Only ever read soft-deleted rows (restore, sync "deleted" feed). */
export const ONLY_DELETED = { deletedAt: { not: null } } as const;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function appendAnd(
  where: Record<string, unknown>,
  condition: Record<string, unknown>,
): Record<string, unknown> {
  const existing = where.AND;
  const list = existing === undefined ? [] : Array.isArray(existing) ? existing : [existing];
  return { ...where, AND: [...list, condition] };
}

/** Pure: returns the args with the soft-delete filter applied, or the args unchanged. */
export function applySoftDeleteFilter(model: string | undefined, operation: string, args: unknown): unknown {
  if (!model || !READ_OPERATIONS.has(operation)) return args;
  const base = isObject(args) ? args : {};
  const where = isObject(base.where) ? base.where : {};

  if ((SOFT_DELETE_MODELS as readonly string[]).includes(model)) {
    if (Object.prototype.hasOwnProperty.call(where, 'deletedAt')) return args;
    return { ...base, where: { ...where, deletedAt: null } };
  }

  const parent = SOFT_DELETE_CHILDREN[model];
  if (parent) {
    const parentWhere = where[parent];
    if (isObject(parentWhere) && Object.prototype.hasOwnProperty.call(parentWhere, 'deletedAt')) {
      return args;
    }
    return { ...base, where: appendAnd(where, { [parent]: { deletedAt: null } }) };
  }

  return args;
}

export const softDeleteExtension = Prisma.defineExtension({
  name: 'ahlan-soft-delete',
  query: {
    $allModels: {
      $allOperations({ model, operation, args, query }) {
        return query(applySoftDeleteFilter(model, operation, args) as typeof args);
      },
    },
  },
});

/* ------------------------------ write helpers ------------------------------ */

/** Columns written by an admin soft delete. */
export function softDeleteData(
  actorId: string,
  reason: string,
  now = new Date(),
): { deletedAt: Date; deletedById: string; deleteReason: string } {
  return { deletedAt: now, deletedById: actorId, deleteReason: reason };
}

/** Columns cleared by a restore. */
export const RESTORE_DATA = { deletedAt: null, deletedById: null, deleteReason: null } as const;

/** DTO fragment shared by every soft-deletable record. */
export function softDeleteDto(row: { deletedAt: Date | null; deleteReason: string | null }): {
  deletedAt: Date | null;
  deleteReason: string | null;
} {
  return { deletedAt: row.deletedAt, deleteReason: row.deleteReason };
}
