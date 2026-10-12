import { Injectable, Logger } from '@nestjs/common';
import { Prisma, type Stadium } from '@prisma/client';
import {
  ERROR_CODES,
  MAX_STADIUM_IMAGE_BYTES,
  STADIUM_IMAGE_TYPES,
  uuidv7,
  type AttachStadiumImageInput,
  type PresignStadiumImageInput,
  type PresignStadiumImageResponse,
  type CreateStadiumInput,
  type ListStadiumsQuery,
  type Paginated,
  type Stadium as StadiumDto,
  type UpdateStadiumInput,
} from '@ahlan/shared';

import { PrismaService } from '../../prisma/prisma.service';
import { AppException } from '../../common/errors/app.exception';
import { cursorArgs, paginateById } from '../../common/util/cursor';
import { buildDiff, hasChanges } from '../../common/util/diff';
import { stadiumScopeWhere, type RequestUser } from '../../common/types/request-user';
import { AuditService } from '../audit/audit.service';
import { StorageService, stadiumImagePrefix } from '../../storage/storage.service';

@Injectable()
export class StadiumsService {
  private readonly logger = new Logger(StadiumsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly storage: StorageService,
  ) {}

  /** DTO with a fresh presigned photo URL (null = the app uses its bundled photo). */
  private async toDto(row: Stadium): Promise<StadiumDto> {
    return { ...toDto(row), imageUrl: await this.storage.stadiumImageUrl(row.imageKey) };
  }

  /**
   * A supervisor's or inspector's list is narrowed to their assignment. This is the query-filter
   * half of the stadium-scoping rule: the guard cannot help on a list endpoint,
   * because no stadium id is named in the request.
   */
  async list(query: ListStadiumsQuery, actor: RequestUser): Promise<Paginated<StadiumDto>> {
    const where: Prisma.StadiumWhereInput = {
      deletedAt: null,
      isActive: query.isActive,
      ...stadiumScopeWhere(actor, 'id'),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' } },
              { code: { contains: query.search, mode: 'insensitive' } },
              { city: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const rows = await this.prisma.stadium.findMany({
      where,
      orderBy: { id: 'desc' },
      take: query.limit + 1,
      ...cursorArgs(query.cursor),
    });

    const page = paginateById(rows, query.limit);
    return { ...page, items: await Promise.all(page.items.map((row) => this.toDto(row))) };
  }

  /** Every stadium the caller may touch, unpaginated - the picker needs them all. */
  async listMine(actor: RequestUser): Promise<StadiumDto[]> {
    const rows = await this.prisma.stadium.findMany({
      where: {
        deletedAt: null,
        isActive: true,
        ...stadiumScopeWhere(actor, 'id'),
      },
      orderBy: { name: 'asc' },
    });
    return Promise.all(rows.map((row) => this.toDto(row)));
  }

  async get(id: string): Promise<StadiumDto> {
    const row = await this.prisma.stadium.findFirst({ where: { id, deletedAt: null } });
    if (!row) throw AppException.notFound('Stadium', id);
    return this.toDto(row);
  }

  /** Time zone only; the hot path for resolving a stadium-local date. */
  async timezoneFor(id: string): Promise<string> {
    const row = await this.prisma.stadium.findFirst({
      where: { id, deletedAt: null },
      select: { timezone: true },
    });
    if (!row) throw AppException.notFound('Stadium', id);
    return row.timezone;
  }

  async create(input: CreateStadiumInput, actor: RequestUser): Promise<StadiumDto> {
    const id = uuidv7();
    const created = await this.prisma.$transaction(async (tx) => {
      const row = await tx.stadium.create({
        data: {
          id,
          name: input.name,
          nameAr: input.nameAr ?? null,
          code: input.code,
          city: input.city ?? null,
          timezone: input.timezone,
          capacity: input.capacity ?? null,
          latitude: input.location?.latitude ?? null,
          longitude: input.location?.longitude ?? null,
          isActive: input.isActive,
        },
      });
      await this.audit.record({ actor, action: 'CREATE', entity: 'stadiums', entityId: id }, tx);
      return row;
    });
    return this.toDto(created);
  }

  async update(id: string, input: UpdateStadiumInput, actor: RequestUser): Promise<StadiumDto> {
    const existing = await this.prisma.stadium.findFirst({ where: { id, deletedAt: null } });
    if (!existing) throw AppException.notFound('Stadium', id);

    const patch = {
      name: input.name,
      nameAr: input.nameAr ?? undefined,
      code: input.code,
      city: input.city ?? undefined,
      timezone: input.timezone,
      capacity: input.capacity ?? undefined,
      latitude: input.location?.latitude,
      longitude: input.location?.longitude,
      isActive: input.isActive,
    };
    const diff = buildDiff(existing, patch as Partial<Stadium>);

    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.stadium.update({ where: { id }, data: patch });
      if (hasChanges(diff)) {
        // A time zone change moves every future local date for this stadium, so
        // it is always worth having in the trail.
        await this.audit.record(
          { actor, action: 'UPDATE', entity: 'stadiums', entityId: id, stadiumId: id, diff },
          tx,
        );
      }
      return row;
    });

    return this.toDto(updated);
  }

  /* ------------------------------- photo -------------------------------- */

  /**
   * Step 1 of a photo upload: a presigned PUT straight to object storage, so the
   * bytes never pass through the API (same flow as evidence).
   */
  async presignImage(
    id: string,
    input: PresignStadiumImageInput,
  ): Promise<PresignStadiumImageResponse> {
    await this.requireLive(id);
    const objectKey = this.storage.buildStadiumImageKey({
      stadiumId: id,
      imageId: uuidv7(),
      contentType: input.contentType,
    });
    const upload = await this.storage.presignUpload({
      objectKey,
      contentType: input.contentType,
      contentLength: input.sizeBytes,
    });
    return {
      uploadUrl: upload.uploadUrl,
      headers: upload.headers,
      objectKey: upload.objectKey,
      expiresAt: upload.expiresAt,
    };
  }

  /**
   * Step 2: point the stadium at the uploaded object. The object must exist,
   * live under this stadium's prefix, be jpeg/png/webp and at most 8 MB. The
   * previous photo is removed from storage.
   */
  async attachImage(
    id: string,
    input: AttachStadiumImageInput,
    actor: RequestUser,
  ): Promise<StadiumDto> {
    const existing = await this.requireLive(id);
    const prefix = stadiumImagePrefix(id);
    if (!input.objectKey.startsWith(prefix) || input.objectKey.includes('..')) {
      throw AppException.validation('This object key does not belong to this stadium', {
        objectKey: input.objectKey,
      });
    }

    const head = await this.storage.head(input.objectKey);
    if (!head.exists) {
      throw AppException.conflict(
        'The photo has not finished uploading. Retry the upload, then attach it again.',
        ERROR_CODES.OBJECT_NOT_UPLOADED,
      );
    }
    if ((head.sizeBytes ?? 0) > MAX_STADIUM_IMAGE_BYTES) {
      await this.removeObject(input.objectKey);
      throw AppException.validation('The photo is larger than 8 MB', { sizeBytes: head.sizeBytes });
    }
    const contentType = head.contentType?.split(';')[0]?.trim().toLowerCase();
    if (contentType && !(STADIUM_IMAGE_TYPES as readonly string[]).includes(contentType)) {
      await this.removeObject(input.objectKey);
      throw AppException.validation('Only JPEG, PNG or WebP photos are accepted', { contentType });
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.stadium.update({
        where: { id },
        data: { imageKey: input.objectKey, imageUpdatedAt: new Date() },
      });
      await this.audit.record(
        {
          actor,
          action: 'UPDATE',
          entity: 'stadiums',
          entityId: id,
          stadiumId: id,
          diff: { imageKey: { from: existing.imageKey, to: input.objectKey } },
        },
        tx,
      );
      return row;
    });

    if (existing.imageKey && existing.imageKey !== input.objectKey) {
      await this.removeObject(existing.imageKey);
    }
    return this.toDto(updated);
  }

  /** Removes the uploaded photo; the app falls back to its bundled photo. */
  async removeImage(id: string, actor: RequestUser): Promise<StadiumDto> {
    const existing = await this.requireLive(id);
    if (!existing.imageKey) return this.toDto(existing);

    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.stadium.update({
        where: { id },
        data: { imageKey: null, imageUpdatedAt: new Date() },
      });
      await this.audit.record(
        {
          actor,
          action: 'UPDATE',
          entity: 'stadiums',
          entityId: id,
          stadiumId: id,
          diff: { imageKey: { from: existing.imageKey, to: null } },
        },
        tx,
      );
      return row;
    });
    await this.removeObject(existing.imageKey);
    return this.toDto(updated);
  }

  private async requireLive(id: string): Promise<Stadium> {
    const row = await this.prisma.stadium.findFirst({ where: { id, deletedAt: null } });
    if (!row) throw AppException.notFound('Stadium', id);
    return row;
  }

  /** Storage clean-up never fails the request; an orphaned object is harmless. */
  private async removeObject(objectKey: string): Promise<void> {
    await this.storage.deleteObject(objectKey).catch((error: Error) => {
      this.logger.warn(`Could not delete ${objectKey}: ${error.message}`);
    });
  }

  /** Soft delete: historical inspections must keep resolving their stadium. */
  async softDelete(id: string, actor: RequestUser, reason?: string): Promise<void> {
    const existing = await this.prisma.stadium.findFirst({ where: { id, deletedAt: null } });
    if (!existing) throw AppException.notFound('Stadium', id);

    await this.prisma.$transaction(async (tx) => {
      await tx.stadium.update({
        where: { id },
        data: { deletedAt: new Date(), isActive: false },
      });
      // Nobody should stay assigned to a stadium that no longer exists.
      await tx.stadiumAssignment.deleteMany({ where: { stadiumId: id } });
      await this.audit.record(
        { actor, action: 'DELETE', entity: 'stadiums', entityId: id, stadiumId: id, reason: reason ?? null },
        tx,
      );
    });
  }

  /** Inspectors covering a stadium, for the admin's assignment screen. */
  async listAssignees(stadiumId: string) {
    return this.prisma.user.findMany({
      where: { deletedAt: null, stadiums: { some: { stadiumId } } },
      select: { id: true, fullName: true, email: true, role: true, status: true },
      orderBy: { fullName: 'asc' },
    });
  }
}

function toDto(row: Stadium): StadiumDto {
  return {
    id: row.id,
    name: row.name,
    nameAr: row.nameAr,
    code: row.code,
    city: row.city,
    timezone: row.timezone,
    capacity: row.capacity,
    location:
      row.latitude !== null && row.longitude !== null
        ? { latitude: row.latitude, longitude: row.longitude, accuracyM: null }
        : null,
    isActive: row.isActive,
    imageUrl: null,
    imageUpdatedAt: row.imageUpdatedAt,
    deletedAt: row.deletedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
