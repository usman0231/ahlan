import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

import type { AppConfig } from '../config/configuration';

export interface PresignedUpload {
  uploadUrl: string;
  objectKey: string;
  headers: Record<string, string>;
  expiresAt: Date;
}

export interface ObjectHead {
  exists: boolean;
  sizeBytes?: number;
  contentType?: string;
}

/**
 * S3-compatible object storage (MinIO locally, Cloudflare R2 in production).
 *
 * Evidence bytes are written by the device straight to storage with a presigned
 * PUT and read back with a presigned GET, so photos never pass through this
 * process. Report PDFs are written here by the worker.
 */
@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  /** Talks to storage from this process (HEAD, server-side PUT). */
  private readonly client: S3Client;
  /**
   * Only signs URLs. The host is part of the signature, so URLs handed to a
   * device must be signed for the address the device can reach.
   */
  private readonly presignClient: S3Client;
  private readonly storage: AppConfig['storage'];

  constructor(private readonly config: ConfigService<AppConfig, true>) {
    this.storage = this.config.get('storage', { infer: true });
    this.client = this.createClient(this.storage.endpoint);
    const { publicEndpoint } = this.storage;
    this.presignClient =
      publicEndpoint === this.storage.endpoint ? this.client : this.createClient(publicEndpoint);
  }

  private createClient(endpoint: string): S3Client {
    return new S3Client({
      endpoint,
      region: this.storage.region,
      forcePathStyle: this.storage.forcePathStyle,
      credentials: {
        accessKeyId: this.storage.accessKeyId,
        secretAccessKey: this.storage.secretAccessKey,
      },
      // SDK v3.729+ defaults to WHEN_SUPPORTED, which signs a CRC32 of the
      // (empty) body into every presigned PUT. The real photo can never match
      // it, so storage answers 400 BadDigest. Only checksum when S3 demands it.
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
    });
  }

  get evidenceBucket(): string {
    return this.storage.evidenceBucket;
  }

  get reportsBucket(): string {
    return this.storage.reportsBucket;
  }

  /**
   * Deterministic key: the same evidence id always maps to the same object, so a
   * retried upload overwrites rather than littering orphans.
   */
  buildEvidenceKey(input: {
    stadiumId: string;
    localDate: string;
    evidenceId: string;
    contentType: string;
  }): string {
    const extension = extensionFor(input.contentType);
    return `evidence/${input.stadiumId}/${input.localDate}/${input.evidenceId}${extension}`;
  }

  /** Admin-uploaded stadium photo, in the evidence bucket under `stadiums/<id>/`. */
  buildStadiumImageKey(input: { stadiumId: string; imageId: string; contentType: string }): string {
    return `${stadiumImagePrefix(input.stadiumId)}${input.imageId}${extensionFor(input.contentType)}`;
  }

  /**
   * Presigned GET for a stadium photo, or null without one. A signing failure
   * degrades to null (the app falls back to the bundled photo) rather than
   * failing the whole list.
   */
  async stadiumImageUrl(imageKey: string | null): Promise<string | null> {
    if (!imageKey) return null;
    return this.presignDownload(imageKey).catch((error: Error) => {
      this.logger.warn(`Could not presign ${imageKey}: ${error.message}`);
      return null;
    });
  }

  buildReportKey(input: {
    tournamentId: string;
    type: string;
    stadiumCode: string | null;
    periodEnd: string;
    reportId: string;
  }): string {
    const scope = input.stadiumCode ?? 'ALL';
    return `reports/${input.tournamentId}/${input.type.toLowerCase()}/${scope}-${input.periodEnd}-${input.reportId}.pdf`;
  }

  async presignUpload(input: {
    bucket?: string;
    objectKey: string;
    contentType: string;
    contentLength?: number;
  }): Promise<PresignedUpload> {
    const bucket = input.bucket ?? this.evidenceBucket;
    const expiresIn = this.storage.presignTtlSeconds;

    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: input.objectKey,
      ContentType: input.contentType,
      ContentLength: input.contentLength,
    });

    const uploadUrl = await getSignedUrl(this.presignClient, command, { expiresIn });

    // The device must replay these headers or the signature will not match.
    const headers: Record<string, string> = { 'Content-Type': input.contentType };
    if (input.contentLength !== undefined) {
      headers['Content-Length'] = String(input.contentLength);
    }

    return {
      uploadUrl,
      objectKey: input.objectKey,
      headers,
      expiresAt: new Date(Date.now() + expiresIn * 1000),
    };
  }

  async presignDownload(objectKey: string, bucket?: string): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: bucket ?? this.evidenceBucket,
      Key: objectKey,
    });
    return getSignedUrl(this.presignClient, command, { expiresIn: this.storage.presignTtlSeconds });
  }

  /** Used to confirm a presigned upload really landed before trusting it. */
  async head(objectKey: string, bucket?: string): Promise<ObjectHead> {
    try {
      const result = await this.client.send(
        new HeadObjectCommand({ Bucket: bucket ?? this.evidenceBucket, Key: objectKey }),
      );
      return {
        exists: true,
        sizeBytes: result.ContentLength,
        contentType: result.ContentType,
      };
    } catch (error) {
      const status = (error as { $metadata?: { httpStatusCode?: number } }).$metadata
        ?.httpStatusCode;
      if (status === 404) return { exists: false };
      // A 403 or 5xx means our credentials or storage are wrong, not that the
      // device skipped the upload. Fail loudly so it is not mistaken for that.
      this.logger.error(`HEAD ${objectKey} failed (${status ?? 'no status'}): ${(error as Error).message}`);
      throw error;
    }
  }

  /**
   * Removes an object. Used when an admin deletes a report or replaces a
   * stadium photo; a missing object is not an error.
   */
  async deleteObject(objectKey: string, bucket?: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: bucket ?? this.evidenceBucket, Key: objectKey }),
    );
  }

  /** Server-side upload. Only the report worker uses this. */
  async putObject(input: {
    bucket?: string;
    objectKey: string;
    body: Buffer;
    contentType: string;
  }): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: input.bucket ?? this.reportsBucket,
        Key: input.objectKey,
        Body: input.body,
        ContentType: input.contentType,
      }),
    );
  }
}

/** Every stadium photo key starts with this; attach refuses anything else. */
export function stadiumImagePrefix(stadiumId: string): string {
  return `stadiums/${stadiumId}/`;
}

function extensionFor(contentType: string): string {
  switch (contentType) {
    case 'image/jpeg':
      return '.jpg';
    case 'image/png':
      return '.png';
    case 'image/webp':
      return '.webp';
    case 'application/pdf':
      return '.pdf';
    default:
      return '';
  }
}
