import { Injectable } from '@nestjs/common';
import type { Discipline } from '@prisma/client';
import {
  uuidv7,
  type CreateDisciplineInput,
  type Discipline as DisciplineDto,
  type UpdateDisciplineInput,
} from '@ahlan/shared';

import { PrismaService } from '../../prisma/prisma.service';
import { AppException } from '../../common/errors/app.exception';
import { buildDiff, hasChanges } from '../../common/util/diff';
import type { RequestUser } from '../../common/types/request-user';
import { AuditService } from '../audit/audit.service';

/**
 * Disciplines live in a table, not in a UI enum, so the HSE team can add one
 * without an app release. Observations are grouped by them, and the seeded set
 * is the six the tournament started with.
 */
@Injectable()
export class DisciplinesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(includeInactive = false): Promise<DisciplineDto[]> {
    const rows = await this.prisma.discipline.findMany({
      where: includeInactive ? { deletedAt: null } : { deletedAt: null, isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    return rows.map(toDto);
  }

  async get(id: string): Promise<DisciplineDto> {
    const row = await this.prisma.discipline.findFirst({ where: { id, deletedAt: null } });
    if (!row) throw AppException.notFound('Discipline', id);
    return toDto(row);
  }

  async create(input: CreateDisciplineInput, actor: RequestUser): Promise<DisciplineDto> {
    const id = uuidv7();
    const created = await this.prisma.$transaction(async (tx) => {
      const row = await tx.discipline.create({
        data: {
          id,
          slug: input.slug,
          name: input.name,
          nameAr: input.nameAr ?? null,
          description: input.description ?? null,
          descriptionAr: input.descriptionAr ?? null,
          icon: input.icon ?? null,
          colorToken: input.colorToken ?? null,
          sortOrder: input.sortOrder,
          isActive: input.isActive,
        },
      });
      await this.audit.record({ actor, action: 'CREATE', entity: 'disciplines', entityId: id }, tx);
      return row;
    });
    return toDto(created);
  }

  async update(
    id: string,
    input: UpdateDisciplineInput,
    actor: RequestUser,
  ): Promise<DisciplineDto> {
    const existing = await this.prisma.discipline.findFirst({ where: { id, deletedAt: null } });
    if (!existing) throw AppException.notFound('Discipline', id);

    const patch = {
      slug: input.slug,
      name: input.name,
      nameAr: input.nameAr ?? undefined,
      description: input.description ?? undefined,
      descriptionAr: input.descriptionAr ?? undefined,
      icon: input.icon ?? undefined,
      colorToken: input.colorToken ?? undefined,
      sortOrder: input.sortOrder,
      isActive: input.isActive,
    };
    const diff = buildDiff(existing, patch as never);

    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.discipline.update({ where: { id }, data: patch });
      if (hasChanges(diff)) {
        await this.audit.record(
          { actor, action: 'UPDATE', entity: 'disciplines', entityId: id, diff },
          tx,
        );
      }
      return row;
    });
    return toDto(updated);
  }

  /**
   * Soft delete (also deactivates): historical observations, findings and
   * checklists keep resolving the discipline, it just stops being offered.
   * Devices keep it as an inactive row so old records still show its name.
   */
  async softDelete(id: string, actor: RequestUser, reason?: string): Promise<void> {
    const existing = await this.prisma.discipline.findFirst({ where: { id, deletedAt: null } });
    if (!existing) throw AppException.notFound('Discipline', id);
    await this.prisma.$transaction(async (tx) => {
      await tx.discipline.update({
        where: { id },
        data: { deletedAt: new Date(), isActive: false },
      });
      await this.audit.record(
        { actor, action: 'DELETE', entity: 'disciplines', entityId: id, reason: reason ?? null },
        tx,
      );
    });
  }
}

function toDto(row: Discipline): DisciplineDto {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    nameAr: row.nameAr,
    description: row.description,
    descriptionAr: row.descriptionAr,
    icon: row.icon,
    colorToken: row.colorToken,
    sortOrder: row.sortOrder,
    isActive: row.isActive,
    deletedAt: row.deletedAt,
  };
}
