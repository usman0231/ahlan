import { Injectable } from '@nestjs/common';
import type { Tournament } from '@prisma/client';
import {
  uuidv7,
  type CreateTournamentInput,
  type Tournament as TournamentDto,
  type UpdateTournamentInput,
} from '@ahlan/shared';

import { PrismaService } from '../../prisma/prisma.service';
import { AppException } from '../../common/errors/app.exception';
import { fromDateColumn, toDateColumn } from '../../common/util/local-date';
import { buildDiff, hasChanges } from '../../common/util/diff';
import type { RequestUser } from '../../common/types/request-user';
import { AuditService } from '../audit/audit.service';

/**
 * Exactly one tournament is active at a time. Cumulative reports run from the
 * active tournament's start date, and new field records are stamped with it.
 */
@Injectable()
export class TournamentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(): Promise<TournamentDto[]> {
    const rows = await this.prisma.tournament.findMany({
      where: { deletedAt: null },
      orderBy: [{ isActive: 'desc' }, { startDate: 'desc' }],
    });
    return rows.map(toDto);
  }

  async get(id: string): Promise<TournamentDto> {
    const row = await this.prisma.tournament.findFirst({ where: { id, deletedAt: null } });
    if (!row) throw AppException.notFound('Tournament', id);
    return toDto(row);
  }

  /** The tournament every new inspection, observation and EOD is stamped with. */
  async getActive(): Promise<TournamentDto | null> {
    const row = await this.prisma.tournament.findFirst({ where: { isActive: true } });
    return row ? toDto(row) : null;
  }

  /** Id only, for the hot path where services just need the stamp. */
  async activeTournamentId(): Promise<string | null> {
    const row = await this.prisma.tournament.findFirst({
      where: { isActive: true },
      select: { id: true },
    });
    return row?.id ?? null;
  }

  async create(input: CreateTournamentInput, actor: RequestUser): Promise<TournamentDto> {
    const id = uuidv7();
    const created = await this.prisma.$transaction(async (tx) => {
      if (input.isActive) {
        await tx.tournament.updateMany({ where: { isActive: true }, data: { isActive: false } });
      }
      const row = await tx.tournament.create({
        data: {
          id,
          name: input.name,
          nameAr: input.nameAr ?? null,
          startDate: toDateColumn(input.startDate),
          endDate: toDateColumn(input.endDate),
          isActive: input.isActive,
        },
      });
      await this.audit.record(
        { actor, action: 'CREATE', entity: 'tournaments', entityId: id },
        tx,
      );
      return row;
    });
    return toDto(created);
  }

  async update(
    id: string,
    input: UpdateTournamentInput,
    actor: RequestUser,
  ): Promise<TournamentDto> {
    const existing = await this.prisma.tournament.findFirst({ where: { id, deletedAt: null } });
    if (!existing) throw AppException.notFound('Tournament', id);

    const startDate = input.startDate ?? fromDateColumn(existing.startDate);
    const endDate = input.endDate ?? fromDateColumn(existing.endDate);
    if (startDate > endDate) {
      throw AppException.validation('startDate must not be after endDate');
    }

    const diff = buildDiff(existing, {
      name: input.name,
      nameAr: input.nameAr ?? undefined,
      isActive: input.isActive,
      startDate: input.startDate ? toDateColumn(input.startDate) : undefined,
      endDate: input.endDate ? toDateColumn(input.endDate) : undefined,
    } as Partial<Tournament>);

    const updated = await this.prisma.$transaction(async (tx) => {
      // Activating one tournament deactivates the rest; there is only ever one.
      if (input.isActive === true) {
        await tx.tournament.updateMany({
          where: { isActive: true, id: { not: id } },
          data: { isActive: false },
        });
      }
      const row = await tx.tournament.update({
        where: { id },
        data: {
          name: input.name,
          nameAr: input.nameAr,
          startDate: input.startDate ? toDateColumn(input.startDate) : undefined,
          endDate: input.endDate ? toDateColumn(input.endDate) : undefined,
          isActive: input.isActive,
        },
      });
      if (hasChanges(diff)) {
        await this.audit.record(
          { actor, action: 'UPDATE', entity: 'tournaments', entityId: id, diff },
          tx,
        );
      }
      return row;
    });

    return toDto(updated);
  }

  async activate(id: string, actor: RequestUser): Promise<TournamentDto> {
    return this.update(id, { isActive: true }, actor);
  }

  /**
   * Soft delete. Records stamped with the tournament keep their reference
   * (nothing is orphaned); the active tournament can never be deleted -
   * activate another one first.
   */
  async softDelete(id: string, actor: RequestUser, reason?: string): Promise<void> {
    const existing = await this.prisma.tournament.findFirst({ where: { id, deletedAt: null } });
    if (!existing) throw AppException.notFound('Tournament', id);
    if (existing.isActive) {
      throw AppException.conflict(
        'The active tournament cannot be deleted. Activate another tournament first.',
      );
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.tournament.update({ where: { id }, data: { deletedAt: new Date() } });
      await this.audit.record(
        { actor, action: 'DELETE', entity: 'tournaments', entityId: id, reason: reason ?? null },
        tx,
      );
    });
  }
}

function toDto(row: Tournament): TournamentDto {
  return {
    id: row.id,
    name: row.name,
    nameAr: row.nameAr,
    startDate: fromDateColumn(row.startDate),
    endDate: fromDateColumn(row.endDate),
    isActive: row.isActive,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt,
  };
}
