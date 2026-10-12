import { Model } from '@nozbe/watermelondb';
import { field, text, writer } from '@nozbe/watermelondb/decorators';
import type { EvidenceUploadStatus } from '@ahlan/shared';

/**
 * A photo, from capture to attached.
 *
 * The row is created the moment the shutter closes, with `localUri` pointing at
 * the compressed file on this device and `uploadStatus` PENDING. The upload
 * queue then walks PENDING rows, requests a presigned PUT, sends the bytes and
 * flips the row to UPLOADED. That ordering is what lets an inspector photograph
 * a non-compliance in a basement with no signal and have it arrive later.
 */
export class EvidenceModel extends Model {
  static override table = 'evidence';

  @text('kind') kind: string;
  @text('context') context: string;
  /** Null until the answer or observation it belongs to has an id. */
  @text('context_id') contextId: string | null;
  @text('object_key') objectKey: string | null;
  @text('content_type') contentType: string;
  @field('size_bytes') sizeBytes: number;
  @field('width') width: number | null;
  @field('height') height: number | null;
  @text('caption') caption: string | null;
  /**
   * The compressed photo on this device (`file://`, or a `data:` URI in the web
   * preview). Kept after upload until the next sync pass so the thumbnail
   * never blinks, then cleared along with the file.
   */
  @text('local_uri') localUri: string | null;
  @text('checksum') checksum: string | null;
  @field('captured_at') capturedAt: number | null;
  @field('latitude') latitude: number | null;
  @field('longitude') longitude: number | null;
  @text('upload_status') uploadStatus: EvidenceUploadStatus;
  /** Real failures only: an attempt that never reached a server is not counted. */
  @field('upload_attempts') uploadAttempts: number;
  @text('upload_error') uploadError: string | null;
  @text('stadium_id') stadiumId: string | null;

  /** True while the bytes exist only on this phone. */
  get isLocalOnly(): boolean {
    return this.uploadStatus !== 'UPLOADED';
  }

  /** The on-device copy, when there still is one. Remote images come from `useEvidenceImage`. */
  get previewSource(): { uri: string } | null {
    return this.localUri ? { uri: this.localUri } : null;
  }

  /**
   * Starting an attempt. Deliberately does not count it: an attempt that never
   * reached the server (offline, signed out) must not use up the retries.
   */
  @writer
  async markUploading(): Promise<void> {
    if (this.uploadStatus === 'PENDING' && this.uploadError === null) return;
    await this.update((record) => {
      record.uploadStatus = 'PENDING';
      record.uploadError = null;
    });
  }

  /** Records the byte length of what is actually being sent. */
  @writer
  async setSizeBytes(sizeBytes: number): Promise<void> {
    if (this.sizeBytes === sizeBytes) return;
    await this.update((record) => {
      record.sizeBytes = sizeBytes;
    });
  }

  @writer
  async markUploaded(objectKey: string): Promise<void> {
    await this.update((record) => {
      record.uploadStatus = 'UPLOADED';
      record.objectKey = objectKey;
      record.uploadError = null;
    });
  }

  /**
   * A real failure: the API or storage answered and refused. Counts one
   * attempt; a permanent failure jumps straight to the limit so the queue stops
   * retrying something that cannot succeed until the inspector acts.
   */
  @writer
  async markAttemptFailed(
    error: string,
    options: { permanent?: boolean; maxAttempts: number },
  ): Promise<void> {
    await this.update((record) => {
      record.uploadStatus = 'FAILED';
      record.uploadError = error.slice(0, 300);
      record.uploadAttempts = options.permanent
        ? Math.max(options.maxAttempts, record.uploadAttempts)
        : record.uploadAttempts + 1;
    });
  }

  /** "Tap to retry": a fresh set of attempts. */
  @writer
  async resetForRetry(): Promise<void> {
    await this.update((record) => {
      record.uploadStatus = 'PENDING';
      record.uploadAttempts = 0;
      record.uploadError = null;
    });
  }

  /** The upload is confirmed and the local copy is gone. */
  @writer
  async clearLocalCopy(): Promise<void> {
    if (this.localUri === null) return;
    await this.update((record) => {
      record.localUri = null;
    });
  }

  @writer
  async attachTo(context: string, contextId: string): Promise<void> {
    await this.update((record) => {
      record.context = context;
      record.contextId = contextId;
    });
  }
}
