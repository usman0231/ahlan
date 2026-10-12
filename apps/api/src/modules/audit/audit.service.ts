import { Injectable, Logger } from '@nestjs/common';
import { Prisma, type AuditAction } from '@prisma/client';
import {
  uuidv7,
  type ListAuditLogsQuery,
  type Paginated,
} from '@ahlan/shared';

import { PrismaService } from '../../prisma/prisma.service';
import { cursorArgs, paginateById } from '../../common/util/cursor';
import { toDateColumn } from '../../common/util/local-date';
import type { FieldDiff } from '../../common/util/diff';
import type { RequestUser } from '../../common/types/request-user';

export interface AuditEntry {
  actor?: Pick<RequestUser, 'id' | 'role'> | null;
  action: AuditAction;
  entity: string;
  entityId?: string | null;
  stadiumId?: string | null;
  reason?: string | null;
  diff?: FieldDiff | null;
  ip?: string | null;
  userAgent?: string | null;
}

/**
 * Append-only trail. Writing an audit row must never be the reason a request
 * fails, so a failure here is logged and swallowed - except inside an explicit
 * transaction, where the caller passes `tx` and wants it to be atomic with the
 * change it describes.
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  async record(entry: AuditEntry, tx?: Prisma.TransactionClient): Promise<void> {
    const data: Prisma.AuditLogUncheckedCreateInput = {
      id: uuidv7(),
      actorId: entry.actor?.id ?? null,
      actorRole: entry.actor?.role ?? null,
      action: entry.action,
      entity: entry.entity,
      entityId: entry.entityId ?? null,
      stadiumId: entry.stadiumId ?? null,
      reason: entry.reason ?? null,
      diff: (entry.diff ?? undefined) as Prisma.InputJsonValue | undefined,
      ip: entry.ip ?? null,
      userAgent: entry.userAgent ?? null,
    };

    if (tx) {
      await tx.auditLog.create({ data });
      return;
    }

    try {
      await this.prisma.auditLog.create({ data });
    } catch (error) {
      this.logger.error(
        `Could not write audit entry ${entry.action} ${entry.entity}:${entry.entityId}`,
        error as Error,
      );
    }
  }

  async list(query: ListAuditLogsQuery): Promise<Paginated<AuditLogRow>> {
    const where: Prisma.AuditLogWhereInput = {
      actorId: query.actorId,
      action: query.action,
      entity: query.entity,
      entityId: query.entityId,
      stadiumId: query.stadiumId,
      createdAt: dateRange(query.from, query.to),
    };

    const rows = await this.prisma.auditLog.findMany({
      where,
      orderBy: { id: 'desc' },
      take: query.limit + 1,
      ...cursorArgs(query.cursor),
      include: { actor: { select: { fullName: true } } },
    });

    return paginateById(
      rows.map((row) => ({
        id: row.id,
        actorId: row.actorId,
        actorName: row.actor?.fullName ?? null,
        actorRole: row.actorRole,
        action: row.action,
        entity: row.entity,
        entityId: row.entityId,
        stadiumId: row.stadiumId,
        reason: row.reason,
        diff: row.diff,
        ip: row.ip,
        userAgent: row.userAgent,
        createdAt: row.createdAt,
      })),
      query.limit,
    );
  }

  /** Everything recorded against one record, oldest first. */
  async historyFor(entity: string, entityId: string): Promise<AuditLogRow[]> {
    const rows = await this.prisma.auditLog.findMany({
      where: { entity, entityId },
      orderBy: { id: 'asc' },
      include: { actor: { select: { fullName: true } } },
    });
    return rows.map((row) => ({
      id: row.id,
      actorId: row.actorId,
      actorName: row.actor?.fullName ?? null,
      actorRole: row.actorRole,
      action: row.action,
      entity: row.entity,
      entityId: row.entityId,
      stadiumId: row.stadiumId,
      reason: row.reason,
      diff: row.diff,
      ip: row.ip,
      userAgent: row.userAgent,
      createdAt: row.createdAt,
    }));
  }
}

export interface AuditLogRow {
  id: string;
  actorId: string | null;
  actorName: string | null;
  actorRole: string | null;
  action: AuditAction;
  entity: string;
  entityId: string | null;
  stadiumId: string | null;
  reason: string | null;
  diff: unknown;
  ip: string | null;
  userAgent: string | null;
  createdAt: Date;
}

function dateRange(from?: string, to?: string): Prisma.DateTimeFilter | undefined {
  if (!from && !to) return undefined;
  return {
    ...(from ? { gte: toDateColumn(from) } : {}),
    // `to` is an inclusive calendar day, so compare against the following midnight.
    ...(to ? { lt: new Date(toDateColumn(to).getTime() + 86_400_000) } : {}),
  };
}
