import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  checklistCompletionFor,
  ERROR_CODES,
  uuidv7,
  zonedDateString,
  type Checklist as ChecklistDto,
  type ChecklistCategory,
  type ChecklistCompletion,
  type ChecklistCompletionQuery,
  type ChecklistSectionInput,
  type ChecklistVersion as ChecklistVersionDto,
  type ChecklistWithVersion,
  type CreateChecklistInput,
  type CreateChecklistVersionInput,
  type ListChecklistsQuery,
  type Paginated,
  type UpdateChecklistMetaInput,
} from '@ahlan/shared';

import { PrismaService } from '../../prisma/prisma.service';
import { AppException } from '../../common/errors/app.exception';
import { cursorArgs, paginateById } from '../../common/util/cursor';
import { buildDiff, hasChanges } from '../../common/util/diff';
import { toDateColumn } from '../../common/util/local-date';
import {
  canAccessStadium,
  stadiumScopeWhere,
  type RequestUser,
} from '../../common/types/request-user';
import { AuditService } from '../audit/audit.service';
import { GLOBAL_EOD_TIMEZONE } from '../eod/eod-windows.service';

const versionInclude = {
  sections: {
    orderBy: { sortOrder: 'asc' },
    include: { items: { orderBy: { sortOrder: 'asc' } } },
  },
} satisfies Prisma.ChecklistVersionInclude;

type VersionRow = Prisma.ChecklistVersionGetPayload<{ include: typeof versionInclude }>;
type ChecklistRow = Prisma.ChecklistGetPayload<{
  include: { stadiums: { select: { stadiumId: true } }; currentVersion: true };
}>;

/**
 * Checklists are versioned, and that is the whole point of this module.
 *
 * Publishing an edit creates version N+1 and re-points `currentVersionId`.
 * Inspections hold a `checklistVersionId`, so a completed inspection always
 * renders against the exact wording it was answered with - even years later.
 */
@Injectable()
export class ChecklistsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(query: ListChecklistsQuery): Promise<Paginated<ChecklistDto>> {
    const where: Prisma.ChecklistWhereInput = {
      deletedAt: null,
      isActive: query.isActive,
      disciplineId: query.disciplineId,
      category: query.category,
      ...(query.stadiumId ? stadiumApplies(query.stadiumId) : {}),
      ...(query.search ? { title: { contains: query.search, mode: 'insensitive' } } : {}),
    };

    const rows = await this.prisma.checklist.findMany({
      where,
      include: { stadiums: { select: { stadiumId: true } }, currentVersion: true },
      orderBy: { id: 'desc' },
      take: query.limit + 1,
      ...cursorArgs(query.cursor),
    });

    const page = paginateById(rows, query.limit);
    return { ...page, items: page.items.map(toChecklistDto) };
  }

  /**
   * What an inspector is offered for a stadium: active checklists that either
   * target this stadium or target none at all, each with its published version.
   */
  async listForStadium(stadiumId: string): Promise<ChecklistWithVersion[]> {
    const rows = await this.prisma.checklist.findMany({
      where: {
        deletedAt: null,
        isActive: true,
        currentVersionId: { not: null },
        ...stadiumApplies(stadiumId),
      },
      include: {
        stadiums: { select: { stadiumId: true } },
        currentVersion: { include: versionInclude },
      },
      orderBy: { title: 'asc' },
    });

    return rows.map((row) => ({
      ...toChecklistDto(row),
      version: row.currentVersion ? toVersionDto(row.currentVersion) : null,
    }));
  }

  async get(id: string): Promise<ChecklistWithVersion> {
    const row = await this.prisma.checklist.findFirst({
      where: { id, deletedAt: null },
      include: {
        stadiums: { select: { stadiumId: true } },
        currentVersion: { include: versionInclude },
      },
    });
    if (!row) throw AppException.notFound('Checklist', id);
    // Nothing published yet (created as a draft): show the latest draft so the
    // admin can review and publish it.
    const version =
      row.currentVersion ??
      (await this.prisma.checklistVersion.findFirst({
        where: { checklistId: id },
        orderBy: { version: 'desc' },
        include: versionInclude,
      }));
    return {
      ...toChecklistDto(row),
      version: version ? toVersionDto(version) : null,
    };
  }

  /**
   * Who completed each checklist on a date. One slot per active inspector per
   * assigned stadium the checklist applies to; a supervisor only sees their
   * stadiums. Rules in `checklistCompletionFor` (@ahlan/shared).
   */
  async completion(
    query: ChecklistCompletionQuery,
    actor: RequestUser,
    now = new Date(),
  ): Promise<ChecklistCompletion[]> {
    if (query.stadiumId && !canAccessStadium(actor, query.stadiumId)) {
      throw AppException.outOfScope();
    }
    const date = query.date ?? zonedDateString(now, GLOBAL_EOD_TIMEZONE);
    const category: ChecklistCategory = query.category ?? 'READINESS';
    const stadiumFilter = {
      ...stadiumScopeWhere(actor),
      ...(query.stadiumId ? { stadiumId: query.stadiumId } : {}),
    };

    const [checklists, assignments, inspections] = await Promise.all([
      this.prisma.checklist.findMany({
        where: { deletedAt: null, isActive: true, category, currentVersionId: { not: null } },
        include: {
          stadiums: { select: { stadiumId: true } },
          currentVersion: { select: { itemCount: true } },
        },
        orderBy: [{ createdAt: 'asc' }, { title: 'asc' }],
      }),
      this.prisma.stadiumAssignment.findMany({
        where: {
          ...stadiumFilter,
          user: { role: 'INSPECTOR', status: 'ACTIVE', deletedAt: null },
          stadium: { deletedAt: null, isActive: true },
        },
        select: {
          stadiumId: true,
          stadium: { select: { code: true } },
          user: { select: { id: true, fullName: true } },
        },
        orderBy: [{ stadium: { code: 'asc' } }, { user: { fullName: 'asc' } }],
      }),
      this.prisma.inspection.findMany({
        where: {
          ...stadiumFilter,
          status: 'SUBMITTED',
          localDate: toDateColumn(date),
          checklist: { category },
        },
        select: { id: true, checklistId: true, inspectorId: true, stadiumId: true },
        orderBy: { submittedAt: 'asc' },
      }),
    ]);

    const slots = assignments.map((row) => ({
      userId: row.user.id,
      fullName: row.user.fullName,
      stadiumId: row.stadiumId,
      stadiumCode: row.stadium.code,
    }));

    return checklists.map((checklist) => {
      const result = checklistCompletionFor(
        checklist.stadiums.map((row) => row.stadiumId),
        slots,
        inspections
          .filter((row) => row.checklistId === checklist.id)
          .map((row) => ({
            inspectorId: row.inspectorId,
            stadiumId: row.stadiumId,
            inspectionId: row.id,
          })),
      );
      return {
        checklistId: checklist.id,
        title: checklist.title,
        titleAr: checklist.titleAr,
        category: checklist.category,
        itemCount: checklist.currentVersion?.itemCount ?? 0,
        ...result,
      };
    });
  }

  /** Any historical version, by id. This is what a submitted inspection reads. */
  async getVersion(versionId: string): Promise<ChecklistVersionDto> {
    const row = await this.prisma.checklistVersion.findUnique({
      where: { id: versionId },
      include: versionInclude,
    });
    if (!row) throw AppException.notFound('Checklist version', versionId);
    return toVersionDto(row);
  }

  async listVersions(checklistId: string): Promise<Omit<ChecklistVersionDto, 'sections'>[]> {
    const rows = await this.prisma.checklistVersion.findMany({
      where: { checklistId },
      orderBy: { version: 'desc' },
    });
    return rows.map((row) => ({
      id: row.id,
      checklistId: row.checklistId,
      version: row.version,
      isPublished: row.isPublished,
      publishedAt: row.publishedAt,
      createdById: row.createdById,
      itemCount: row.itemCount,
      createdAt: row.createdAt,
    }));
  }

  async create(input: CreateChecklistInput, actor: RequestUser): Promise<ChecklistWithVersion> {
    await this.assertReferencesExist(input.disciplineId ?? null, input.stadiumIds);

    const checklistId = uuidv7();
    const versionId = uuidv7();

    await this.prisma.$transaction(async (tx) => {
      await tx.checklist.create({
        data: {
          id: checklistId,
          title: input.title,
          titleAr: input.titleAr ?? null,
          description: input.description ?? null,
          category: defaultCategory(input.category, input.disciplineId),
          disciplineId: input.disciplineId ?? null,
          isActive: true,
          stadiums: {
            create: input.stadiumIds.map((stadiumId) => ({ stadiumId })),
          },
        },
      });

      await this.writeVersion(tx, {
        versionId,
        checklistId,
        version: 1,
        sections: input.sections,
        publish: input.publish,
        createdById: actor.id,
        changeNote: 'Initial version',
      });

      await this.audit.record(
        {
          actor,
          action: 'CREATE',
          entity: 'checklists',
          entityId: checklistId,
          diff: { title: { from: null, to: input.title }, version: { from: null, to: 1 } },
        },
        tx,
      );
    });

    return this.get(checklistId);
  }

  /** Title, description, discipline and stadium targeting only - no new version. */
  async updateMeta(
    id: string,
    input: UpdateChecklistMetaInput,
    actor: RequestUser,
  ): Promise<ChecklistWithVersion> {
    const existing = await this.prisma.checklist.findFirst({
      where: { id, deletedAt: null },
      include: { stadiums: { select: { stadiumId: true } } },
    });
    if (!existing) throw AppException.notFound('Checklist', id);
    await this.assertReferencesExist(input.disciplineId ?? null, input.stadiumIds ?? []);

    const diff = buildDiff(existing, {
      title: input.title,
      titleAr: input.titleAr ?? undefined,
      description: input.description ?? undefined,
      category: input.category,
      disciplineId: input.disciplineId ?? undefined,
      isActive: input.isActive,
    } as never);

    await this.prisma.$transaction(async (tx) => {
      await tx.checklist.update({
        where: { id },
        data: {
          title: input.title,
          titleAr: input.titleAr,
          description: input.description,
          category: input.category,
          disciplineId: input.disciplineId,
          isActive: input.isActive,
        },
      });

      if (input.stadiumIds) {
        await tx.checklistStadium.deleteMany({ where: { checklistId: id } });
        if (input.stadiumIds.length > 0) {
          await tx.checklistStadium.createMany({
            data: [...new Set(input.stadiumIds)].map((stadiumId) => ({
              checklistId: id,
              stadiumId,
            })),
          });
        }
      }

      if (hasChanges(diff) || input.stadiumIds) {
        await this.audit.record(
          { actor, action: 'UPDATE', entity: 'checklists', entityId: id, diff },
          tx,
        );
      }
    });

    return this.get(id);
  }

  /**
   * The only way to change questions. Produces version N+1; previously submitted
   * inspections keep pointing at the version they used.
   */
  async createVersion(
    checklistId: string,
    input: CreateChecklistVersionInput,
    actor: RequestUser,
  ): Promise<ChecklistWithVersion> {
    const checklist = await this.prisma.checklist.findFirst({
      where: { id: checklistId, deletedAt: null },
    });
    if (!checklist) throw AppException.notFound('Checklist', checklistId);

    const latest = await this.prisma.checklistVersion.findFirst({
      where: { checklistId },
      orderBy: { version: 'desc' },
      select: { version: true },
    });
    const nextVersion = (latest?.version ?? 0) + 1;
    const versionId = uuidv7();

    await this.prisma.$transaction(async (tx) => {
      await this.writeVersion(tx, {
        versionId,
        checklistId,
        version: nextVersion,
        sections: input.sections,
        publish: input.publish,
        createdById: actor.id,
        changeNote: input.changeNote ?? null,
      });

      await this.audit.record(
        {
          actor,
          action: 'UPDATE',
          entity: 'checklists',
          entityId: checklistId,
          reason: input.changeNote ?? 'New checklist version',
          diff: {
            version: { from: latest?.version ?? null, to: nextVersion },
            published: { from: null, to: input.publish },
          },
        },
        tx,
      );
    });

    return this.get(checklistId);
  }

  /** Publishes a draft version and makes it the one inspectors are served. */
  async publishVersion(versionId: string, actor: RequestUser): Promise<ChecklistWithVersion> {
    const version = await this.prisma.checklistVersion.findUnique({ where: { id: versionId } });
    if (!version) throw AppException.notFound('Checklist version', versionId);
    if (version.isPublished) {
      throw AppException.conflict('This version is already published');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.checklistVersion.update({
        where: { id: versionId },
        data: { isPublished: true, publishedAt: new Date() },
      });
      await tx.checklist.update({
        where: { id: version.checklistId },
        data: { currentVersionId: versionId },
      });
      await this.audit.record(
        {
          actor,
          action: 'UPDATE',
          entity: 'checklist_versions',
          entityId: versionId,
          reason: 'Published',
          diff: { isPublished: { from: false, to: true } },
        },
        tx,
      );
    });

    return this.get(version.checklistId);
  }

  /**
   * Soft delete. Submitted inspections keep pointing at their version (the
   * rows stay); the checklist just stops being served and listed.
   */
  async softDelete(id: string, actor: RequestUser, reason?: string): Promise<void> {
    const existing = await this.prisma.checklist.findFirst({ where: { id, deletedAt: null } });
    if (!existing) throw AppException.notFound('Checklist', id);

    await this.prisma.$transaction(async (tx) => {
      await tx.checklist.update({
        where: { id },
        data: { deletedAt: new Date(), isActive: false },
      });
      await this.audit.record(
        { actor, action: 'DELETE', entity: 'checklists', entityId: id, reason: reason ?? null },
        tx,
      );
    });
  }

  /* --------------------------- internals --------------------------- */

  /**
   * Writes the sections and items of a version. Item ids may come from the
   * client so the authoring UI can keep its own ordering stable.
   */
  private async writeVersion(
    tx: Prisma.TransactionClient,
    input: {
      versionId: string;
      checklistId: string;
      version: number;
      sections: ChecklistSectionInput[];
      publish: boolean;
      createdById: string;
      changeNote: string | null;
    },
  ): Promise<void> {
    const itemCount = input.sections.reduce((sum, section) => sum + section.items.length, 0);
    const sections = await freshIds(tx, input.sections);

    await tx.checklistVersion.create({
      data: {
        id: input.versionId,
        checklistId: input.checklistId,
        version: input.version,
        isPublished: input.publish,
        publishedAt: input.publish ? new Date() : null,
        createdById: input.createdById,
        changeNote: input.changeNote,
        itemCount,
        sections: {
          create: sections.map((section, sectionIndex) => ({
            id: section.id ?? uuidv7(),
            title: section.title,
            titleAr: section.titleAr ?? null,
            sortOrder: sectionIndex,
            items: {
              create: section.items.map((item, itemIndex) => ({
                id: item.id ?? uuidv7(),
                code: item.code,
                question: item.question,
                questionAr: item.questionAr ?? null,
                guidance: item.guidance ?? null,
                defaultSeverity: item.defaultSeverity,
                allowNa: item.allowNa,
                sortOrder: itemIndex,
              })),
            },
          })),
        },
      },
    });

    if (input.publish) {
      await tx.checklist.update({
        where: { id: input.checklistId },
        data: { currentVersionId: input.versionId },
      });
    }
  }

  private async assertReferencesExist(
    disciplineId: string | null,
    stadiumIds: string[],
  ): Promise<void> {
    if (disciplineId) {
      const discipline = await this.prisma.discipline.findUnique({ where: { id: disciplineId } });
      if (!discipline) {
        throw AppException.badRequest(ERROR_CODES.VALIDATION_FAILED, 'Unknown discipline');
      }
    }
    if (stadiumIds.length > 0) {
      const found = await this.prisma.stadium.count({
        where: { id: { in: stadiumIds }, deletedAt: null },
      });
      if (found !== new Set(stadiumIds).size) {
        throw AppException.badRequest(
          ERROR_CODES.VALIDATION_FAILED,
          'One or more stadium ids do not exist',
        );
      }
    }
  }
}

/** An explicit category wins; otherwise a discipline checklist is DISCIPLINE. */
function defaultCategory(
  category: ChecklistCategory | undefined,
  disciplineId: string | null | undefined,
): ChecklistCategory {
  if (category) return category;
  return disciplineId ? 'DISCIPLINE' : 'GENERAL';
}

/** Targets this stadium explicitly, or targets no stadium at all. */
function stadiumApplies(stadiumId: string): Prisma.ChecklistWhereInput {
  return {
    OR: [{ stadiums: { some: { stadiumId } } }, { stadiums: { none: {} } }],
  };
}

function toChecklistDto(row: ChecklistRow): ChecklistDto {
  return {
    id: row.id,
    title: row.title,
    titleAr: row.titleAr,
    description: row.description,
    category: row.category,
    disciplineId: row.disciplineId,
    stadiumIds: row.stadiums.map((entry) => entry.stadiumId),
    isActive: row.isActive,
    currentVersion: row.currentVersion?.version ?? null,
    currentVersionId: row.currentVersionId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt,
  };
}

function toVersionDto(row: VersionRow): ChecklistVersionDto {
  return {
    id: row.id,
    checklistId: row.checklistId,
    version: row.version,
    isPublished: row.isPublished,
    publishedAt: row.publishedAt,
    createdById: row.createdById,
    itemCount: row.itemCount,
    createdAt: row.createdAt,
    sections: row.sections.map((section) => ({
      id: section.id,
      versionId: section.versionId,
      title: section.title,
      titleAr: section.titleAr,
      sortOrder: section.sortOrder,
      items: section.items.map((item) => ({
        id: item.id,
        sectionId: item.sectionId,
        code: item.code,
        question: item.question,
        questionAr: item.questionAr,
        guidance: item.guidance,
        defaultSeverity: item.defaultSeverity,
        allowNa: item.allowNa,
        sortOrder: item.sortOrder,
      })),
    })),
  };
}

/**
 * Section and item ids may come from the client so the authoring UI keeps a
 * stable order, but a version never shares rows with another: when the admin
 * edits a checklist the UI naturally re-sends the previous version's ids, so
 * any id that already exists (or repeats within the payload) is re-minted.
 */
async function freshIds(
  tx: Prisma.TransactionClient,
  sections: ChecklistSectionInput[],
): Promise<ChecklistSectionInput[]> {
  const sectionIds = sections.flatMap((section) => (section.id ? [section.id] : []));
  const itemIds = sections.flatMap((section) =>
    section.items.flatMap((item) => (item.id ? [item.id] : [])),
  );
  const [takenSections, takenItems] = await Promise.all([
    sectionIds.length
      ? tx.checklistSection.findMany({ where: { id: { in: sectionIds } }, select: { id: true } })
      : [],
    itemIds.length
      ? tx.checklistItem.findMany({ where: { id: { in: itemIds } }, select: { id: true } })
      : [],
  ]);
  const used = new Set([...takenSections, ...takenItems].map((row) => row.id));
  const claim = (id: string | undefined): string => {
    const next = id && !used.has(id) ? id : uuidv7();
    used.add(next);
    return next;
  };
  return sections.map((section) => ({
    ...section,
    id: claim(section.id),
    items: section.items.map((item) => ({ ...item, id: claim(item.id) })),
  }));
}
