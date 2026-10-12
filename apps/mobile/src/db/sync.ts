import { synchronize, type SyncPullResult, type SyncDatabaseChangeSet } from '@nozbe/watermelondb/sync';
import { Q } from '@nozbe/watermelondb';
import type { PullResponse, PushResponse, PushRejection } from '@ahlan/shared';

import { api, ApiError } from '../api/client';
import { collections, database } from './index';
import { SCHEMA_VERSION } from './schema';
import { toPushPayload } from './push-payload';
import { reconcileDeletions, type LocalLookup, type PulledChanges } from './pull-deletions';
import { MIGRATIONS_ENABLED_AT_VERSION } from './migrations';
import { useSyncStore } from '../store/sync';
import type { EvidenceModel } from './models/evidence';
import { uploadPendingEvidence, type UploadSummary } from '../features/evidence/upload-queue';

const DEBUG = process.env.EXPO_PUBLIC_DEBUG === '1';

export interface SyncOutcome {
  pulled: number;
  pushed: number;
  rejected: PushRejection[];
  /** Photo upload result for this pass, when the upload step ran. */
  uploads?: UploadSummary;
  error?: ApiError;
}

/**
 * One sync pass, in the order that matters:
 *
 *   1. upload any photo bytes that are still only on this device
 *   2. push local records, so the server has what the inspector created
 *   3. pull everything that changed
 *
 * Photos go first on purpose. The API rejects a NO answer whose photo has not
 * landed, so pushing an inspection before its evidence would mean a rejection
 * the inspector cannot act on.
 */
export async function runSync(): Promise<SyncOutcome> {
  const store = useSyncStore.getState();
  if (store.status === 'syncing') {
    // Already running: a pull-to-refresh on top of the interval timer should
    // not start a second pass.
    return { pulled: 0, pushed: 0, rejected: [] };
  }

  store.setStatus('syncing');
  let pulled = 0;
  let pushed = 0;
  let rejected: PushRejection[] = [];
  const pushedIds = new Set<string>();
  let uploads: UploadSummary | undefined;

  try {
    uploads = await uploadPendingEvidence();
    // Before the record sync, so a failed photo shows even if that sync then
    // fails for an unrelated reason.
    await refreshFailedUploads();

    await synchronize({
      database,

      pullChanges: async ({ lastPulledAt, migration }) => {
        // After a local schema upgrade, rows pulled earlier have the new
        // columns empty (discipline descriptions, checklist categories, EOD
        // window defaults...). An incremental pull would never resend them,
        // so the first pull after a migration fetches everything again.
        const since = migration ? 0 : (lastPulledAt ?? 0);
        const response = await api.get<PullResponse>('/sync/pull', {
          lastPulledAt: since,
          schemaVersion: SCHEMA_VERSION,
        });

        // Records an Admin soft-deleted arrive in `deleted` (or with a
        // `deleted_at`): drop them here, with their children, but never a
        // local draft or unpushed change.
        const changes = await reconcileDeletions(
          response.changes as unknown as PulledChanges,
          localLookup,
        );

        pulled = Object.values(changes).reduce(
          (sum, set) =>
            sum + (set?.created.length ?? 0) + (set?.updated.length ?? 0) + (set?.deleted.length ?? 0),
          0,
        );

        return {
          changes: changes as unknown as SyncDatabaseChangeSet,
          timestamp: response.timestamp,
        } satisfies SyncPullResult;
      },

      pushChanges: async ({ changes, lastPulledAt }) => {
        const tableSets = Object.values(changes) as {
          created: { id: unknown }[];
          updated: { id: unknown }[];
        }[];
        for (const set of tableSets) {
          for (const row of [...set.created, ...set.updated]) {
            pushedIds.add(String(row.id));
          }
        }
        const response = await api.post<PushResponse>('/sync/push', {
          changes: toPushPayload(changes),
          lastPulledAt,
        });
        pushed = response.accepted;
        rejected = response.rejected;
        // Only collected here. Writing the rejection inside this callback
        // lands inside the push session's bookkeeping, so WatermelonDB marks
        // the write as already-synced and the record never pushes again -
        // even after the server-side cause is fixed.
      },

      // Our tables carry `server_updated_at` rather than Watermelon's own
      // `_changed` bookkeeping for the server side.
      sendCreatedAsUpdated: true,
      migrationsEnabledAtVersion: MIGRATIONS_ENABLED_AT_VERSION,
      log: DEBUG ? undefined : undefined,
    });

    // After the session, in this order: everything that was pushed is now
    // either accepted or in `rejected`, so first flip the lot - including
    // previously FAILED rows whose retry just went through - to SYNCED, then
    // re-flag exactly the ones the server still refuses. Writing rejections
    // here rather than inside pushChanges keeps those rows dirty, so a
    // record rejected by a since-fixed server rule retries and heals; a
    // genuinely invalid one stays FAILED with its reason on the row.
    await markSyncedRecords(pushedIds);
    await markRejections(rejected);
    await refreshFailedUploads();

    store.setStatus('idle');
    store.setLastSyncedAt(Date.now());
    if (DEBUG) {
      console.warn(
        `[sync] ${uploads.uploaded} photo(s) up, ${uploads.failed} failed, pushed ${pushed}, pulled ${pulled}, rejected ${rejected.length}`,
      );
    }

    return { pulled, pushed, rejected, uploads };
  } catch (error) {
    const apiError =
      error instanceof ApiError ? error : new ApiError('UNKNOWN', (error as Error).message, 0);

    // Offline is the expected case in a stadium basement, not a failure worth
    // shouting about; the banner says "offline" and the work stays queued.
    store.setStatus(apiError.isOffline ? 'offline' : 'error');
    store.setError(apiError.code);

    return { pulled, pushed, rejected, uploads, error: apiError };
  }
}

/** Raw local rows for `reconcileDeletions`, read outside any writer. */
const localLookup: LocalLookup = {
  byIds: (table, ids) =>
    ids.length === 0
      ? Promise.resolve([])
      : database.get(table).query(Q.where('id', Q.oneOf(ids))).unsafeFetchRaw(),
  byColumn: (table, column, values) =>
    values.length === 0
      ? Promise.resolve([])
      : database.get(table).query(Q.where(column, Q.oneOf(values))).unsafeFetchRaw(),
};

/**
 * Flips everything that reached the server to SYNCED.
 *
 * A FAILED row is only flipped when it was actually part of this session's
 * push (its retry went through); a failed row that never got pushed again
 * must keep saying FAILED rather than being quietly whitewashed.
 */
async function markSyncedRecords(pushedIds: ReadonlySet<string>): Promise<void> {
  await database.write(async () => {
    for (const table of ['inspections', 'observations', 'eod_reports'] as const) {
      const rows = await database
        .get(table)
        .query(
          Q.where('sync_state', Q.oneOf(['LOCAL', 'SYNCING', 'FAILED'])),
          Q.where('status', 'SUBMITTED'),
        )
        .fetch();
      const pending = rows.filter(
        (record) =>
          (record as unknown as { syncState: string }).syncState !== 'FAILED' ||
          pushedIds.has(record.id),
      );

      await database.batch(
        ...pending.map((record) =>
          record.prepareUpdate((row) => {
            (row as unknown as { syncState: string }).syncState = 'SYNCED';
            (row as unknown as { syncError: string | null }).syncError = null;
            // Pure local bookkeeping: the server just acknowledged this exact
            // content, so the row must not become "dirty" again - that made
            // every sync re-push what the previous sync had just accepted.
            (row as unknown as { _raw: { _status: string; _changed: string } })._raw._status =
              'synced';
            (row as unknown as { _raw: { _status: string; _changed: string } })._raw._changed = '';
          }),
        ),
      );
    }
  });
}


/**
 * Forces a locally-synced record back into the next push.
 *
 * `record.update()` with unchanged columns is optimised away, so this writes
 * the sync bookkeeping directly - the sanctioned-if-ugly way to say "send
 * this row again". Needed because inspection responses sync ahead of their
 * inspection while it is still a draft, and the server rebuilds a submitted
 * inspection only from the responses in the same push.
 */
export async function forceRepush(records: { update: (cb: (row: unknown) => void) => Promise<unknown> }[]): Promise<void> {
  for (const record of records) {
    await record.update((row) => {
      const raw = (row as { _raw: { _status: string } })._raw;
      raw._status = 'updated';
    });
  }
}

/** Writes each rejection onto its own row so the UI can explain the failure. */
async function markRejections(rejections: PushRejection[]): Promise<void> {
  if (rejections.length === 0) return;

  await database.write(async () => {
    for (const rejection of rejections) {
      try {
        const record = await database.get(rejection.table).find(rejection.id);
        await record.update((row) => {
          (row as unknown as { syncState: string }).syncState = 'FAILED';
          (row as unknown as { syncError: string | null }).syncError =
            `${rejection.code}: ${rejection.message}`;
        });

        // The server rebuilds a pushed inspection from the responses in the
        // same push. When the inspection is rejected its responses were still
        // acknowledged, so without this touch the retry would arrive
        // child-less and fail forever on "responses: at least 1 element".
        if (rejection.table === 'inspections') {
          const responses = await collections
            .inspectionResponses()
            .query(Q.where('inspection_id', rejection.id))
            .fetch();
          await forceRepush(responses);
        }
      } catch (error) {
        // A missing record (deleted locally since the push) is expected here;
        // anything else must not be silent - this catch once hid a failure
        // that kept rejected inspections from ever retrying.
        console.warn('[sync] could not mark rejection', rejection.id, error);
      }
    }
  });
}

/**
 * Publishes how many photos are FAILED, so the banner can say so and offer a
 * retry - a failed upload must never look like a quiet, finished sync.
 */
export async function refreshFailedUploads(): Promise<number> {
  const count = await collections
    .evidence()
    .query(Q.where('upload_status', 'FAILED'))
    .fetchCount();
  useSyncStore.getState().setFailedUploads(count);
  return count;
}

/** Rows the inspector has created that the server has not accepted yet. */
export async function countPendingRecords(): Promise<number> {
  const [inspections, observations, eod, evidence] = await Promise.all([
    collections
      .inspections()
      .query(Q.where('status', 'SUBMITTED'), Q.where('sync_state', Q.notEq('SYNCED')))
      .fetchCount(),
    collections
      .observations()
      .query(Q.where('status', 'SUBMITTED'), Q.where('sync_state', Q.notEq('SYNCED')))
      .fetchCount(),
    collections
      .eodReports()
      .query(Q.where('status', 'SUBMITTED'), Q.where('sync_state', Q.notEq('SYNCED')))
      .fetchCount(),
    collections
      .evidence()
      .query(Q.where('upload_status', Q.notEq('UPLOADED')))
      .fetchCount(),
  ]);

  return inspections + observations + eod + evidence;
}

/** Local-only photos, for the storage figure in Settings. */
export async function pendingEvidence(): Promise<EvidenceModel[]> {
  return collections
    .evidence()
    .query(Q.where('upload_status', Q.notEq('UPLOADED')))
    .fetch();
}
