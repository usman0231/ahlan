import { Q } from '@nozbe/watermelondb';
import NetInfo from '@react-native-community/netinfo';
import {
  ERROR_CODES,
  type EvidenceContext,
  type PresignEvidenceResponse,
} from '@ahlan/shared';

import { api, uploadToPresignedUrl, ApiError } from '../../api/client';
import { collections } from '../../db';
import type { EvidenceModel } from '../../db/models/evidence';
import { useSettingsStore } from '../../store/settings';
import { localFileExists, readLocalFile } from './local-files';
import { purgeUploadedLocalCopies } from './local-cleanup';

/** Real failures before a photo waits for the inspector to tap "retry". */
export const MAX_ATTEMPTS = 5;

export interface UploadSummary {
  uploaded: number;
  /** Real failures in this pass (counted against the photo's attempts). */
  failed: number;
  /** Not tried: Wi-Fi-only, out of attempts, or the pass stopped early. */
  skipped: number;
  /** Photos that are FAILED and out of automatic retries; need a tap to retry. */
  exhausted: number;
  /** The pass stopped because the API could not be reached or the session ended. */
  deferred: boolean;
}

/**
 * What a failure means for the queue:
 *
 * - `deferred`    never reached a server we could act on (offline, signed out,
 *                 rate limited, or the bytes landed but `complete` was lost).
 *                 Not counted; the rest of the batch waits for the next sync.
 * - `unreachable` the API answered but storage could not be reached. Counted
 *                 (a misconfigured storage host must surface, not look "offline"
 *                 forever) and the batch stops, since the rest would fail too.
 * - `transient`   storage or the API refused this one photo. Counted, next.
 * - `permanent`   can never succeed as-is (validation, scope, file gone).
 *                 Jumps to the attempt limit; only a manual retry tries again.
 */
export type UploadFailureKind = 'deferred' | 'unreachable' | 'transient' | 'permanent';
export type UploadStage = 'read' | 'presign' | 'put' | 'complete';

const PERMANENT_CODES: ReadonlySet<string> = new Set([
  ERROR_CODES.VALIDATION_FAILED,
  ERROR_CODES.FORBIDDEN,
  ERROR_CODES.STADIUM_OUT_OF_SCOPE,
  ERROR_CODES.NOT_FOUND,
]);

/** The compressed photo is gone from the device; nothing can be retried. */
export class FileMissingError extends Error {
  override name = 'FileMissingError';
}

export function classifyUploadError(error: unknown, stage: UploadStage): UploadFailureKind {
  if (!(error instanceof ApiError)) return stage === 'read' ? 'permanent' : 'transient';
  if (error.isAuthError || error.code === ERROR_CODES.RATE_LIMITED) return 'deferred';
  if (error.code === 'NETWORK') {
    // The presign just succeeded, so the network is up: storage is the problem.
    if (stage === 'put') return 'unreachable';
    return 'deferred';
  }
  if (stage !== 'complete' && PERMANENT_CODES.has(error.code)) return 'permanent';
  return 'transient';
}

/** Stored on the row as `CODE: message`; the UI maps CODE to translated copy. */
export function describeUploadError(error: unknown, stage: UploadStage): string {
  if (error instanceof FileMissingError) return `FILE_MISSING: ${error.message}`;
  if (error instanceof ApiError) {
    const code = error.code === 'NETWORK' && stage === 'put' ? 'STORAGE_UNREACHABLE' : error.code;
    return `${code}: ${error.message}`;
  }
  return `UNKNOWN: ${(error as Error)?.message ?? String(error)}`;
}

/** The leading code of a stored `uploadError`, for i18n lookups. */
export function uploadErrorCode(uploadError: string | null): string | null {
  if (!uploadError) return null;
  const match = /^([A-Z_]+):/.exec(uploadError);
  return match?.[1] ?? 'UNKNOWN';
}

class StageError extends Error {
  constructor(
    readonly stage: UploadStage,
    readonly failure: unknown,
  ) {
    super((failure as Error)?.message ?? 'Upload failed');
  }
}

async function stage<T>(name: UploadStage, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    throw new StageError(name, error);
  }
}

/** One upload per photo at a time, even if a sync and a manual retry overlap. */
const inFlight = new Map<string, Promise<void>>();

function uploadOnce(evidence: EvidenceModel): Promise<void> {
  const running = inFlight.get(evidence.id);
  if (running) return running;
  const promise = uploadOne(evidence).finally(() => inFlight.delete(evidence.id));
  inFlight.set(evidence.id, promise);
  return promise;
}

async function uploadOne(evidence: EvidenceModel): Promise<void> {
  await evidence.markUploading();

  // Read first: the presign signs Content-Length, so it must be the length of
  // exactly these bytes - not a size remembered from capture time.
  const body = await stage('read', async () => {
    const uri = evidence.localUri;
    if (!uri || !localFileExists(uri)) {
      throw new FileMissingError('The photo file is no longer on this device');
    }
    const bytes = await readLocalFile(uri);
    const size = bytes instanceof Blob ? bytes.size : bytes.byteLength;
    if (size <= 0) {
      throw new FileMissingError('The photo file is empty');
    }
    return { bytes, size };
  });
  await evidence.setSizeBytes(body.size);

  let presigned: PresignEvidenceResponse;
  try {
    presigned = await stage('presign', () =>
      api.post<PresignEvidenceResponse>('/evidence/presign', {
        id: evidence.id,
        kind: evidence.kind,
        context: evidence.context as EvidenceContext,
        contextId: evidence.contextId,
        stadiumId: evidence.stadiumId,
        contentType: evidence.contentType,
        sizeBytes: body.size,
        width: evidence.width,
        height: evidence.height,
        caption: evidence.caption,
        capturedAt: evidence.capturedAt ? new Date(evidence.capturedAt).toISOString() : null,
        gps:
          evidence.latitude !== null && evidence.longitude !== null
            ? { latitude: evidence.latitude, longitude: evidence.longitude, accuracyM: null }
            : null,
      }),
    );
  } catch (error) {
    // A previous pass uploaded and completed it, but the response was lost.
    const cause = error instanceof StageError ? error.failure : error;
    if (cause instanceof ApiError && cause.code === ERROR_CODES.ALREADY_EXISTS) {
      const objectKey = (cause.details as { objectKey?: string } | undefined)?.objectKey;
      await evidence.markUploaded(objectKey ?? evidence.objectKey ?? '');
      return;
    }
    throw error;
  }

  await stage('put', () =>
    uploadToPresignedUrl({
      uploadUrl: presigned.uploadUrl,
      headers: presigned.headers,
      body: body.bytes,
    }),
  );

  // The API verifies the object really exists before trusting it. Safe to
  // repeat: completing an uploaded photo returns it unchanged.
  await stage('complete', () =>
    api.post(`/evidence/${evidence.id}/complete`, { sizeBytes: body.size }),
  );
  await evidence.markUploaded(presigned.objectKey);
  // The local copy stays until the next pass (see purgeUploadedLocalCopies).
}

/**
 * Walks the photos not yet uploaded and uploads each one.
 *
 * Nothing streams through the API: the device asks for a presigned PUT, sends
 * the bytes straight to object storage, then tells the API the object landed.
 * Only real failures count against a photo's attempts (see
 * `classifyUploadError`); FAILED photos with attempts left are retried
 * automatically on the next pass.
 */
export async function uploadPendingEvidence(
  options: {
    /** Only these photos, attempt limit ignored (an explicit user action). */
    ids?: string[];
    /** Upload even on mobile data (the user pressed something). */
    ignoreWifiOnly?: boolean;
  } = {},
): Promise<UploadSummary> {
  const summary: UploadSummary = {
    uploaded: 0,
    failed: 0,
    skipped: 0,
    exhausted: 0,
    deferred: false,
  };
  const explicit = options.ids !== undefined;

  if (!explicit) {
    await purgeUploadedLocalCopies().catch((error: unknown) => {
      console.warn('[upload] could not free uploaded photos', error);
    });
  }

  const conditions = [Q.where('upload_status', Q.notEq('UPLOADED'))];
  if (explicit) conditions.push(Q.where('id', Q.oneOf(options.ids ?? [])));
  const pending = await collections
    .evidence()
    .query(...conditions, Q.sortBy('created_at', Q.asc))
    .fetch();

  if (!options.ignoreWifiOnly && (await shouldWaitForWifi())) {
    summary.skipped = pending.length;
    summary.exhausted = pending.filter(isExhausted).length;
    return summary;
  }

  for (let index = 0; index < pending.length; index += 1) {
    const evidence = pending[index] as EvidenceModel;
    if (!explicit && isExhausted(evidence)) {
      summary.skipped += 1;
      summary.exhausted += 1;
      continue;
    }

    try {
      await uploadOnce(evidence);
      summary.uploaded += 1;
    } catch (error) {
      const failedStage = error instanceof StageError ? error.stage : 'presign';
      const cause = error instanceof StageError ? error.failure : error;
      const kind = classifyUploadError(cause, failedStage);

      if (kind === 'deferred') {
        // Leave the photo exactly as it was: PENDING, attempts untouched.
        summary.deferred = true;
        summary.skipped += pending.length - index;
        break;
      }

      await evidence.markAttemptFailed(describeUploadError(cause, failedStage), {
        permanent: kind === 'permanent',
        maxAttempts: MAX_ATTEMPTS,
      });
      summary.failed += 1;
      if (isExhausted(evidence)) summary.exhausted += 1;

      if (kind === 'unreachable') {
        summary.skipped += pending.length - index - 1;
        break;
      }
    }
  }

  return summary;
}

function isExhausted(evidence: EvidenceModel): boolean {
  return evidence.uploadStatus === 'FAILED' && evidence.uploadAttempts >= MAX_ATTEMPTS;
}

/** Honours the inspector's "Wi-Fi only" preference for photo uploads. */
async function shouldWaitForWifi(): Promise<boolean> {
  if (!useSettingsStore.getState().wifiOnlyUploads) return false;
  const state = await NetInfo.fetch();
  return state.type !== 'wifi';
}

/**
 * "Tap to retry": gives failed photos a fresh set of attempts and uploads them
 * now. With no ids, every FAILED photo.
 */
export async function retryFailedEvidence(ids?: string[]): Promise<UploadSummary> {
  const conditions = [Q.where('upload_status', 'FAILED')];
  if (ids) conditions.push(Q.where('id', Q.oneOf(ids)));
  const failed = await collections
    .evidence()
    .query(...conditions)
    .fetch();

  // Each reset is its own writer (`@writer` on the model) - WatermelonDB
  // rejects an update made outside database.write.
  for (const evidence of failed) await evidence.resetForRetry();

  return uploadPendingEvidence({ ids: failed.map((row) => row.id), ignoreWifiOnly: true });
}

/**
 * Uploads specific photos right now and reports which are still not on the
 * server. Used before an action that the API only accepts with uploaded
 * evidence (closing a corrective action).
 */
export async function uploadEvidenceNow(
  ids: string[],
): Promise<{ summary: UploadSummary; notUploaded: string[] }> {
  if (ids.length === 0) {
    return {
      summary: { uploaded: 0, failed: 0, skipped: 0, exhausted: 0, deferred: false },
      notUploaded: [],
    };
  }
  const summary = await uploadPendingEvidence({ ids, ignoreWifiOnly: true });
  const remaining = await collections
    .evidence()
    .query(Q.where('id', Q.oneOf(ids)), Q.where('upload_status', Q.notEq('UPLOADED')))
    .fetch();
  return { summary, notUploaded: remaining.map((row) => row.id) };
}

/** Photos that gave up and need the inspector's tap. */
export function exhaustedEvidenceQuery() {
  return collections
    .evidence()
    .query(Q.where('upload_status', 'FAILED'), Q.where('upload_attempts', Q.gte(MAX_ATTEMPTS)));
}
