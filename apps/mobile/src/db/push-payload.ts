/**
 * Columns that only mean something on this device and must never travel in a
 * sync push.
 *
 * `local_uri` is the important one: on the web preview a photo is kept as a
 * `data:` URI (there is no file system), so pushing it put the whole image in
 * the JSON body and the API refused it as too large - which blocked the
 * inspection that referenced the photo from ever syncing. Photo bytes go to
 * storage through presigned URLs; the server ignores these columns anyway.
 */
const DEVICE_ONLY_COLUMNS: Record<string, readonly string[]> = {
  evidence: ['local_uri', 'upload_attempts', 'upload_error'],
};

type Row = Record<string, unknown>;
type ChangeSet = Record<string, { created: Row[]; updated: Row[]; deleted: string[] } | undefined>;

/** Returns a copy of `changes` without device-only columns. */
export function toPushPayload<T extends ChangeSet>(changes: T): T {
  const result: ChangeSet = {};
  for (const [table, set] of Object.entries(changes)) {
    const drop = DEVICE_ONLY_COLUMNS[table];
    if (!set || !drop) {
      result[table] = set;
      continue;
    }
    const strip = (row: Row): Row => {
      const copy = { ...row };
      for (const column of drop) delete copy[column];
      return copy;
    };
    result[table] = { ...set, created: set.created.map(strip), updated: set.updated.map(strip) };
  }
  return result as T;
}
