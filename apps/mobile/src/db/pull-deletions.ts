/**
 * Server-side soft deletes, applied on the device (U4).
 *
 * When an Admin soft-deletes an inspection, observation, finding or EOD report,
 * the pull sends its id in that table's `deleted` bucket and WatermelonDB
 * destroys the local row permanently - whatever state it is in. This module
 * shapes the pulled change set before WatermelonDB applies it:
 *
 *   - a pulled row that still carries a `deleted_at` is treated as a deletion,
 *     so the device behaves the same whichever way the server reports it;
 *   - children that only make sense under a deleted parent go with it
 *     (inspection responses, a finding's corrective actions);
 *   - local work is never removed: a draft, or any row with changes the server
 *     has not acknowledged yet, is kept even if its id is in `deleted`.
 *     Drafts never exist server-side, so this is a safety net, not a path.
 *
 * Kept free of the database so the rules are unit tested; `runSync` feeds it
 * the local rows it needs.
 */

export interface PulledTableChanges {
  created: Record<string, unknown>[];
  updated: Record<string, unknown>[];
  deleted: string[];
}

export type PulledChanges = Record<string, PulledTableChanges | undefined>;

/** The bits of a local row that decide whether a remote deletion may remove it. */
export interface LocalRow {
  id: string;
  /** WatermelonDB's own bookkeeping: anything but 'synced' has unpushed changes. */
  _status?: string;
  status?: unknown;
  [column: string]: unknown;
}

/** Parent tables whose deletion takes child rows with it, and how they link. */
/**
 * The API already sends these children as deleted (WAVE3-API); this is the
 * device-side guarantee. Evidence is deliberately not cascaded: it is only
 * ever shown through its parent, and a restore does not re-send untouched
 * evidence rows, so removing it would lose the photos after a restore.
 */
export const DELETION_CASCADE: Record<string, { table: string; column: string }[]> = {
  inspections: [{ table: 'inspection_responses', column: 'inspection_id' }],
  findings: [{ table: 'corrective_actions', column: 'finding_id' }],
};

/** Rows that hold unpushed work on this device. */
export function isLocalWork(row: LocalRow): boolean {
  if (row.status === 'DRAFT') return true;
  return row._status !== undefined && row._status !== 'synced';
}

/** Moves pulled rows that carry a non-null `deleted_at` into `deleted`. */
export function foldSoftDeletedRows(changes: PulledChanges): PulledChanges {
  const out: PulledChanges = {};
  for (const [table, set] of Object.entries(changes)) {
    if (!set) continue;
    const isDeleted = (row: Record<string, unknown>) =>
      row.deleted_at !== undefined && row.deleted_at !== null && row.deleted_at !== '';
    const moved = [...set.created, ...set.updated].filter(isDeleted).map((row) => String(row.id));
    out[table] = {
      created: set.created.filter((row) => !isDeleted(row)),
      updated: set.updated.filter((row) => !isDeleted(row)),
      deleted: unique([...(set.deleted ?? []), ...moved]),
    };
  }
  return out;
}

/**
 * Looks up local rows. `byIds` returns the rows of `table` with those ids;
 * `byColumn` the rows of `table` whose `column` is one of `values`.
 */
export interface LocalLookup {
  byIds(table: string, ids: string[]): Promise<LocalRow[]>;
  byColumn(table: string, column: string, values: string[]): Promise<LocalRow[]>;
}

/**
 * The change set WatermelonDB should apply: soft-deleted rows folded into
 * `deleted`, cascaded children added, local work protected.
 */
export async function reconcileDeletions(
  changes: PulledChanges,
  local: LocalLookup,
): Promise<PulledChanges> {
  const result = foldSoftDeletedRows(changes);

  // Breadth-first over the cascade, so a deeper rule would also apply.
  const queue: string[] = Object.keys(result).filter(
    (table) => (result[table]?.deleted.length ?? 0) > 0,
  );
  const visited = new Set<string>();
  while (queue.length > 0) {
    const parent = queue.shift() as string;
    const parentIds = result[parent]?.deleted ?? [];
    const key = `${parent}:${parentIds.join(',')}`;
    if (parentIds.length === 0 || visited.has(key)) continue;
    visited.add(key);

    for (const child of DELETION_CASCADE[parent] ?? []) {
      const rows = await local.byColumn(child.table, child.column, parentIds);
      if (rows.length === 0) continue;
      const set = (result[child.table] ??= { created: [], updated: [], deleted: [] });
      const before = set.deleted.length;
      set.deleted = unique([...set.deleted, ...rows.map((row) => row.id)]);
      if (set.deleted.length > before) queue.push(child.table);
    }
  }

  // Never remove local work, and never apply an update to a row being deleted.
  for (const [table, set] of Object.entries(result)) {
    if (!set || set.deleted.length === 0) continue;
    const rows = await local.byIds(table, set.deleted);
    const protectedIds = new Set(rows.filter(isLocalWork).map((row) => row.id));
    set.deleted = set.deleted.filter((id) => !protectedIds.has(id));
    const gone = new Set(set.deleted);
    set.created = set.created.filter((row) => !gone.has(String(row.id)));
    set.updated = set.updated.filter((row) => !gone.has(String(row.id)));
  }

  return result;
}

function unique(ids: string[]): string[] {
  return [...new Set(ids)];
}
