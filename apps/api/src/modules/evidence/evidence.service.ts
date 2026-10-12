import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { Prisma, type Evidence, type EvidenceContext } from '@prisma/client';
import {
  ERROR_CODES,
  zonedDateString,
  type CompleteEvidenceInput,
  type Evidence as EvidenceDto,
  type PresignEvidenceInput,
  type PresignEvidenceResponse,
} from '@ahlan/shared';

import { PrismaService } from '../../prisma/prisma.service';
import { deletedEvidenceContextIds } from '../../prisma/soft-delete-queries';
import { StorageService, type ObjectHead } from '../../storage/storage.service';
import { AppException } from '../../common/errors/app.exception';
import {
  assertCanEnterFieldData,
  isStadiumScoped,
  stadiumScopeWhere,
  type RequestUser,
} from '../../common/types/request-user';

/**
 * Evidence metadata and the presigned upload flow.
 *
 * The device mints the evidence id, asks for a presigned PUT, uploads the bytes
 * straight to object storage, then calls `complete`. Nothing but metadata ever
 * travels through this process, which is what keeps photo upload survivable on
 * a stadium mobile connection.
 */
@Injectable()
export class EvidenceService {
  private readonly logger = new Logger(EvidenceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  /**
   * Idempotent: asking again for the same evidence id returns the same object
   * key with a fresh signature, so a device that lost connectivity mid-upload
   * can simply retry.
   */
  async presign(
    input: PresignEvidenceInput,
    actor: RequestUser,
  ): Promise<PresignEvidenceResponse> {
    // Photos only exist as part of field records or an admin closure; a
    // supervisor reviews but never creates either.
    assertCanEnterFieldData(actor);

    const stadium = await this.prisma.stadium.findFirst({
      where: { id: input.stadiumId, deletedAt: null },
      select: { id: true, timezone: true },
    });
    if (!stadium) {
      this.logFailure('presign', input.id, actor, 'STADIUM_NOT_FOUND', {
        stadiumId: input.stadiumId,
      });
      throw AppException.notFound('Stadium', input.stadiumId);
    }

    const existing = await this.prisma.evidence.findUnique({ where: { id: input.id } });
    if (existing) {
      if (existing.uploadedById !== actor.id) {
        this.logFailure('presign', input.id, actor, 'FOREIGN_EVIDENCE');
        throw AppException.forbidden('This evidence belongs to another user');
      }
      if (existing.uploadStatus === 'UPLOADED') {
        // The device lost the `complete` response and is asking again. The
        // bytes are already safe, so this is not something the user can act
        // on: a stable code plus the object key lets the app record success.
        this.logger.log(
          JSON.stringify({
            event: 'evidence.presign.already_uploaded',
            evidenceId: input.id,
            userId: actor.id,
          }),
        );
        throw AppException.conflict(
          'This evidence has already been uploaded',
          ERROR_CODES.ALREADY_EXISTS,
          {
            evidenceId: existing.id,
            objectKey: existing.objectKey,
            uploadStatus: existing.uploadStatus,
          },
        );
      }
    }

    const capturedAt = input.capturedAt ?? new Date();
    const objectKey =
      existing?.objectKey ??
      this.storage.buildEvidenceKey({
        stadiumId: stadium.id,
        localDate: zonedDateString(capturedAt, stadium.timezone),
        evidenceId: input.id,
        contentType: input.contentType,
      });

    const data = {
      kind: input.kind,
      context: input.context,
      contextId: input.contextId ?? null,
      objectKey,
      contentType: input.contentType,
      sizeBytes: input.sizeBytes,
      width: input.width ?? null,
      height: input.height ?? null,
      caption: input.caption ?? null,
      checksum: input.checksum ?? null,
      capturedAt,
      latitude: input.gps?.latitude ?? null,
      longitude: input.gps?.longitude ?? null,
      gpsAccuracyM: input.gps?.accuracyM ?? null,
      uploadStatus: 'PENDING' as const,
      uploadedById: actor.id,
      stadiumId: stadium.id,
    };

    await this.prisma.evidence.upsert({
      where: { id: input.id },
      create: { id: input.id, ...data },
      update: data,
    });

    // Content-Length stays signed: it is what stops a device writing an object
    // larger than MAX_EVIDENCE_BYTES. The app sends the byte length of the
    // exact body it is about to PUT, so the two always agree.
    const presigned = await this.storage
      .presignUpload({ objectKey, contentType: input.contentType, contentLength: input.sizeBytes })
      .catch((error: Error) => {
        this.logFailure('presign', input.id, actor, 'SIGNING_FAILED', { message: error.message });
        throw AppException.internal('Could not prepare the photo upload');
      });

    return {
      evidenceId: input.id,
      objectKey,
      uploadUrl: presigned.uploadUrl,
      headers: presigned.headers,
      expiresAt: presigned.expiresAt,
    };
  }

  /**
   * Confirms the upload landed. The object is HEADed rather than trusted: a
   * device that crashed mid-PUT would otherwise leave a record pointing at
   * nothing, and that record would end up in a report.
   */
  async complete(
    id: string,
    input: CompleteEvidenceInput,
    actor: RequestUser,
  ): Promise<EvidenceDto> {
    const evidence = await this.prisma.evidence.findUnique({ where: { id } });
    if (!evidence) {
      this.logFailure('complete', id, actor, 'NOT_FOUND');
      throw AppException.notFound('Evidence', id);
    }
    if (evidence.uploadedById !== actor.id && actor.role !== 'ADMIN') {
      this.logFailure('complete', id, actor, 'FOREIGN_EVIDENCE');
      throw AppException.forbidden('This evidence belongs to another user');
    }

    // Idempotent: a device whose first `complete` response was lost calls
    // again. The object was verified the first time; answer the same way.
    if (evidence.uploadStatus === 'UPLOADED') return this.hydrate(evidence);

    let head: ObjectHead;
    try {
      head = await this.storage.head(evidence.objectKey);
    } catch (error) {
      // Storage itself is unhealthy (credentials, 5xx). Not the device's fault
      // and not proof the upload is missing, so the row is left alone.
      this.logFailure('complete', id, actor, 'STORAGE_UNAVAILABLE', {
        objectKey: evidence.objectKey,
        message: (error as Error).message,
      });
      throw new AppException(
        ERROR_CODES.INTERNAL_ERROR,
        'Photo storage is unavailable. The upload will be retried.',
        HttpStatus.BAD_GATEWAY,
      );
    }
    if (!head.exists) {
      this.logFailure('complete', id, actor, 'OBJECT_MISSING', { objectKey: evidence.objectKey });
      await this.prisma.evidence.update({
        where: { id },
        data: { uploadStatus: 'FAILED' },
      });
      throw AppException.conflict(
        'The uploaded file could not be found in storage. Please retry the upload.',
      );
    }

    const updated = await this.prisma.evidence.update({
      where: { id },
      data: {
        uploadStatus: 'UPLOADED',
        sizeBytes: head.sizeBytes ?? input.sizeBytes ?? evidence.sizeBytes,
        checksum: input.checksum ?? evidence.checksum,
      },
    });

    return this.hydrate(updated);
  }

  async get(id: string, actor: RequestUser): Promise<EvidenceDto> {
    const evidence = await this.prisma.evidence.findUnique({ where: { id } });
    if (!evidence) throw AppException.notFound('Evidence', id);
    this.assertReadable(evidence, actor);
    // Photos of a soft-deleted record vanish with it, except for an admin.
    if (actor.role !== 'ADMIN' && evidence.contextId) {
      const dead = await deletedEvidenceContextIds(this.prisma, [evidence]);
      if (dead.size > 0) throw AppException.notFound('Evidence', id);
    }
    return this.hydrate(evidence);
  }

  async listFor(
    context: EvidenceContext,
    contextId: string,
    actor: RequestUser,
  ): Promise<EvidenceDto[]> {
    const rows = await this.prisma.evidence.findMany({
      where: {
        context,
        contextId,
        // Scoped unless ADMIN: inspectors and supervisors see their stadiums only.
        ...stadiumScopeWhere(actor),
      },
      orderBy: { createdAt: 'asc' },
    });
    // Photos of a soft-deleted record vanish with it, except for an admin.
    if (actor.role !== 'ADMIN' && rows.length > 0) {
      const dead = await deletedEvidenceContextIds(this.prisma, rows);
      if (dead.has(contextId)) return [];
    }
    return this.hydrateMany(rows);
  }

  /**
   * Links uploaded evidence to its parent record. Called by the inspection,
   * observation, finding and EOD services as part of their own transaction.
   */
  async attach(
    evidenceIds: string[],
    context: EvidenceContext,
    contextId: string,
    actor: RequestUser,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    if (evidenceIds.length === 0) return;
    const client = tx ?? this.prisma;

    const rows = await client.evidence.findMany({
      where: { id: { in: evidenceIds } },
      select: { id: true, uploadStatus: true, uploadedById: true, contextId: true },
    });

    const found = new Set(rows.map((row) => row.id));
    const missing = evidenceIds.filter((id) => !found.has(id));
    if (missing.length > 0) {
      throw AppException.badRequest(
        ERROR_CODES.VALIDATION_FAILED,
        'Some photos have not been uploaded yet',
        { missing },
      );
    }

    const notUploaded = rows.filter((row) => row.uploadStatus !== 'UPLOADED');
    if (notUploaded.length > 0) {
      throw AppException.badRequest(
        ERROR_CODES.EVIDENCE_REQUIRED,
        'Some photos are still uploading. Try again once they have finished.',
        { pending: notUploaded.map((row) => row.id) },
      );
    }

    // Re-pointing someone else's photo would let a user borrow evidence.
    const foreign = rows.filter(
      (row) => row.uploadedById !== actor.id && actor.role !== 'ADMIN',
    );
    if (foreign.length > 0) {
      throw AppException.forbidden('Some of these photos belong to another user');
    }

    await client.evidence.updateMany({
      where: { id: { in: evidenceIds } },
      data: { context, contextId },
    });
  }

  /** Count of closure photos on an action - the closure-evidence rule reads this. */
  async countFor(context: EvidenceContext, contextId: string): Promise<number> {
    return this.prisma.evidence.count({
      where: { context, contextId, uploadStatus: 'UPLOADED' },
    });
  }

  /** Adds a short-lived presigned GET so the app can render the image. */
  async hydrate(evidence: Evidence): Promise<EvidenceDto> {
    const url =
      evidence.uploadStatus === 'UPLOADED'
        ? await this.storage.presignDownload(evidence.objectKey).catch((error: Error) => {
            this.logger.warn(`Could not presign ${evidence.objectKey}: ${error.message}`);
            return null;
          })
        : null;
    return toDto(evidence, url);
  }

  async hydrateMany(rows: Evidence[]): Promise<EvidenceDto[]> {
    return Promise.all(rows.map((row) => this.hydrate(row)));
  }

  /** One JSON line per failed presign/complete, so a stuck photo can be traced. */
  private logFailure(
    step: 'presign' | 'complete',
    evidenceId: string,
    actor: RequestUser,
    reason: string,
    extra: Record<string, unknown> = {},
  ): void {
    this.logger.warn(
      JSON.stringify({
        event: `evidence.${step}.failed`,
        reason,
        evidenceId,
        userId: actor.id,
        role: actor.role,
        ...extra,
      }),
    );
  }

  private assertReadable(evidence: Evidence, actor: RequestUser): void {
    if (!isStadiumScoped(actor)) return;
    if (evidence.stadiumId && !actor.stadiumIds.includes(evidence.stadiumId)) {
      throw AppException.outOfScope();
    }
  }
}

function toDto(row: Evidence, url: string | null): EvidenceDto {
  return {
    id: row.id,
    kind: row.kind,
    context: row.context,
    contextId: row.contextId,
    objectKey: row.objectKey,
    contentType: row.contentType,
    sizeBytes: row.sizeBytes,
    width: row.width,
    height: row.height,
    caption: row.caption,
    capturedAt: row.capturedAt,
    gps:
      row.latitude !== null && row.longitude !== null
        ? { latitude: row.latitude, longitude: row.longitude, accuracyM: row.gpsAccuracyM }
        : null,
    uploadStatus: row.uploadStatus,
    uploadedById: row.uploadedById,
    stadiumId: row.stadiumId,
    createdAt: row.createdAt,
    url,
    thumbnailUrl: url,
  };
}
