import { Injectable } from '@nestjs/common';
import { Prisma, type Severity } from '@prisma/client';
import {
  isOverdue,
  uuidv7,
  zonedDateString,
  DEFAULT_TIME_ZONE,
  type CorrectiveAction as CorrectiveActionDto,
  type CreateFindingInput,
  type Finding as FindingDto,
  type ListFindingsQuery,
  type Paginated,
  type UpdateFindingInput,
} from '@ahlan/shared';

import { PrismaService } from '../../prisma/prisma.service';
import {
  INCLUDING_DELETED,
  ONLY_DELETED,
  RESTORE_DATA,
  deletedAtFilter,
  softDeleteData,
  softDeleteDto,
} from '../../prisma/soft-delete';
import { touchRestoredChildren } from '../../prisma/soft-delete-queries';
import { AppException } from '../../common/errors/app.exception';
import { cursorArgs, paginateById } from '../../common/util/cursor';
import { buildDiff, hasChanges } from '../../common/util/diff';
import { fromDateColumn, toDateColumn } from '../../common/util/local-date';
import {
  canAccessStadium,
  isAdmin,
  isStadiumScoped,
  stadiumScopeWhere,
  type RequestUser,
} from '../../common/types/request-user';
import { AuditService } from '../audit/audit.service';
import { EvidenceService } from '../evidence/evidence.service';
import { NotificationsService } from '../notifications/notifications.service';

export const findingInclude = {
  stadium: { select: { name: true } },
  raisedBy: { select: { fullName: true } },
  actions: {
    orderBy: { createdAt: 'asc' },
    include: { assignee: { select: { fullName: true } } },
  },
} satisfies Prisma.FindingInclude;

export type FindingRow = Prisma.FindingGetPayload<{ include: typeof findingInclude }>;

/**
 * Findings are raised by the system, not by hand: a NO answer on an inspection
 * and an unsafe observation each create exactly one. They are never hard-deleted:
 * the normal way out is the corrective-action lifecycle to CLOSED, and an admin
 * may soft-delete (and restore) one with an audited reason, which hides its
 * corrective actions too (see soft-delete.ts).
 */
@Injectable()
export class FindingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly evidence: EvidenceService,
    private readonly notifications: NotificationsService,
  ) {}

  async list(query: ListFindingsQuery, actor: RequestUser): Promise<Paginated<FindingDto>> {
    const where: Prisma.FindingWhereInput = {
      stadiumId: query.stadiumId,
      disciplineId: query.disciplineId,
      severity: query.severity,
      status: query.status,
      source: query.source,
      raisedById: query.raisedById,
      tournamentId: query.tournamentId,
      localDate: dateRange(query.from, query.to),
      ...deletedAtFilter(isAdmin(actor) && query.includeDeleted),
      ...(query.assigneeId ? { actions: { some: { assigneeId: query.assigneeId } } } : {}),
      // The query-filter half of stadium scoping, for when no id is named.
      ...stadiumScopeWhere(actor),
      ...(query.search
        ? {
            OR: [
              { reference: { contains: query.search, mode: 'insensitive' } },
              { title: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
      // Overdue is derived, so it is expressed as a predicate rather than a status.
      ...(query.overdueOnly
        ? {
            status: { not: 'CLOSED' },
            actions: {
              some: {
                dueDate: { lt: toDateColumn(zonedDateString(new Date(), DEFAULT_TIME_ZONE)) },
                status: { not: 'CLOSED' },
              },
            },
          }
        : {}),
    };

    // A stadium filter must never widen a scoped user's view.
    if (isStadiumScoped(actor) && query.stadiumId) {
      if (!actor.stadiumIds.includes(query.stadiumId)) throw AppException.outOfScope();
      where.stadiumId = query.stadiumId;
    }

    const rows = await this.prisma.finding.findMany({
      where,
      include: findingInclude,
      orderBy: { id: 'desc' },
      take: query.limit + 1,
      ...cursorArgs(query.cursor),
    });

    const page = paginateById(rows, query.limit);
    return { ...page, items: await Promise.all(page.items.map((row) => this.toDto(row))) };
  }

  async get(id: string, actor: RequestUser): Promise<FindingDto> {
    // An admin can still open a soft-deleted finding (to restore it); nobody else can.
    const row = await this.prisma.finding.findFirst({
      where: { id, ...(isAdmin(actor) ? INCLUDING_DELETED : {}) },
      include: findingInclude,
    });
    if (!row) throw AppException.notFound('Finding', id);
    this.assertInScope(row.stadiumId, actor);
    return this.toDto(row);
  }

  /** Corrective actions assigned to the caller, newest first. */
  async listMyActions(actor: RequestUser): Promise<FindingDto[]> {
    const rows = await this.prisma.finding.findMany({
      where: {
        status: { not: 'CLOSED' },
        actions: { some: { assigneeId: actor.id, status: { not: 'CLOSED' } } },
      },
      include: findingInclude,
      orderBy: { id: 'desc' },
      take: 200,
    });
    return Promise.all(rows.map((row) => this.toDto(row)));
  }

  /**
   * Raised inside the inspection submit transaction. The unique constraint on
   * `inspectionResponseId` makes a retried submit idempotent rather than
   * doubling up the finding.
   */
  async raiseFromInspectionResponse(
    tx: Prisma.TransactionClient,
    input: {
      responseId: string;
      inspectionId: string;
      stadiumId: string;
      stadiumCode: string;
      tournamentId: string | null;
      disciplineId: string | null;
      localDate: string;
      raisedAt: Date;
      raisedById: string;
      itemCode: string;
      question: string;
      comment: string | null;
      severity: Severity;
      evidenceIds: string[];
    },
  ): Promise<string | null> {
    const existing = await tx.finding.findFirst({
      where: { inspectionResponseId: input.responseId, ...INCLUDING_DELETED },
      select: { id: true },
    });
    if (existing) return existing.id;

    const id = uuidv7();
    await tx.finding.create({
      data: {
        id,
        reference: await this.nextReference(tx, input.stadiumCode),
        stadiumId: input.stadiumId,
        tournamentId: input.tournamentId,
        disciplineId: input.disciplineId,
        source: 'INSPECTION',
        inspectionId: input.inspectionId,
        inspectionResponseId: input.responseId,
        raisedById: input.raisedById,
        title: `${input.itemCode}: ${truncate(input.question, 140)}`,
        description: input.comment ?? input.question,
        severity: input.severity,
        status: 'OPEN',
        localDate: toDateColumn(input.localDate),
        raisedAt: input.raisedAt,
      },
    });

    // The photos that proved the NO become the finding's evidence too.
    if (input.evidenceIds.length > 0) {
      await tx.evidence.updateMany({
        where: { id: { in: input.evidenceIds } },
        data: { context: 'INSPECTION_RESPONSE', contextId: input.responseId },
      });
    }

    return id;
  }

  /** Raised inside the observation submit transaction. */
  async raiseFromObservation(
    tx: Prisma.TransactionClient,
    input: {
      observationId: string;
      stadiumId: string;
      stadiumCode: string;
      tournamentId: string | null;
      disciplineId: string;
      localDate: string;
      raisedAt: Date;
      raisedById: string;
      title: string;
      description: string;
      severity: Severity;
    },
  ): Promise<string | null> {
    const existing = await tx.finding.findFirst({
      where: { observationId: input.observationId, ...INCLUDING_DELETED },
      select: { id: true },
    });
    if (existing) return existing.id;

    const id = uuidv7();
    await tx.finding.create({
      data: {
        id,
        reference: await this.nextReference(tx, input.stadiumCode),
        stadiumId: input.stadiumId,
        tournamentId: input.tournamentId,
        disciplineId: input.disciplineId,
        source: 'OBSERVATION',
        observationId: input.observationId,
        raisedById: input.raisedById,
        title: input.title,
        description: input.description,
        severity: input.severity,
        status: 'OPEN',
        localDate: toDateColumn(input.localDate),
        raisedAt: input.raisedAt,
      },
    });
    return id;
  }

  /** Admin-raised finding, outside an inspection or observation. */
  async createManual(input: CreateFindingInput, actor: RequestUser): Promise<FindingDto> {
    const stadium = await this.prisma.stadium.findFirst({
      where: { id: input.stadiumId, deletedAt: null },
      select: { id: true, code: true, timezone: true },
    });
    if (!stadium) throw AppException.notFound('Stadium', input.stadiumId);

    const tournament = await this.prisma.tournament.findFirst({
      where: { isActive: true },
      select: { id: true },
    });
    const now = new Date();
    const id = input.id ?? uuidv7();

    await this.prisma.$transaction(async (tx) => {
      await tx.finding.create({
        data: {
          id,
          reference: await this.nextReference(tx, stadium.code),
          stadiumId: stadium.id,
          tournamentId: tournament?.id ?? null,
          disciplineId: input.disciplineId ?? null,
          source: 'MANUAL',
          raisedById: actor.id,
          title: input.title,
          description: input.description,
          severity: input.severity,
          status: 'OPEN',
          localDate: toDateColumn(zonedDateString(now, stadium.timezone)),
          raisedAt: now,
        },
      });

      await this.evidence.attach(input.evidenceIds, 'FINDING', id, actor, tx);

      await this.audit.record(
        {
          actor,
          action: 'CREATE',
          entity: 'findings',
          entityId: id,
          stadiumId: stadium.id,
          reason: 'Manually raised',
        },
        tx,
      );
    });

    return this.get(id, actor);
  }

  /** Editing a finding is an admin correction, so a reason is mandatory. */
  async update(id: string, input: UpdateFindingInput, actor: RequestUser): Promise<FindingDto> {
    const existing = await this.prisma.finding.findFirst({ where: { id, ...INCLUDING_DELETED } });
    if (!existing) throw AppException.notFound('Finding', id);
    if (existing.deletedAt) throw AppException.deleted('This finding');
    if (existing.status === 'CLOSED') {
      throw AppException.locked('This finding is closed and can no longer be edited');
    }

    const patch = {
      title: input.title,
      description: input.description,
      severity: input.severity,
      disciplineId: input.disciplineId ?? undefined,
    };
    const diff = buildDiff(existing, patch as never);

    await this.prisma.$transaction(async (tx) => {
      await tx.finding.update({ where: { id }, data: patch });
      if (hasChanges(diff)) {
        await this.audit.record(
          {
            actor,
            action: 'ADMIN_CORRECTION',
            entity: 'findings',
            entityId: id,
            stadiumId: existing.stadiumId,
            reason: input.reason,
            diff,
          },
          tx,
        );
      }
    });

    return this.get(id, actor);
  }

  /** Admin soft delete. Its corrective actions disappear with it (soft-delete.ts). */
  async softDelete(id: string, reason: string, actor: RequestUser): Promise<void> {
    const existing = await this.prisma.finding.findFirst({
      where: { id, ...INCLUDING_DELETED },
      select: { id: true, stadiumId: true, deletedAt: true },
    });
    if (!existing) throw AppException.notFound('Finding', id);
    if (existing.deletedAt) throw AppException.conflict('This finding is already deleted');

    await this.prisma.$transaction(async (tx) => {
      await tx.finding.update({ where: { id }, data: softDeleteData(actor.id, reason) });
      await this.audit.record(
        { actor, action: 'DELETE', entity: 'findings', entityId: id, stadiumId: existing.stadiumId, reason },
        tx,
      );
    });
  }

  /**
   * Restores a soft-deleted finding. Refused while the inspection or
   * observation that raised it is itself deleted - restore that instead.
   */
  async restore(id: string, reason: string, actor: RequestUser): Promise<FindingDto> {
    const existing = await this.prisma.finding.findFirst({
      where: { id, ...ONLY_DELETED },
      select: {
        id: true,
        stadiumId: true,
        inspection: { select: { deletedAt: true } },
        observation: { select: { deletedAt: true } },
      },
    });
    if (!existing) {
      if ((await this.prisma.finding.count({ where: { id } })) > 0) {
        throw AppException.conflict('This finding is not deleted');
      }
      throw AppException.notFound('Finding', id);
    }
    if (existing.inspection?.deletedAt || existing.observation?.deletedAt) {
      throw AppException.conflict(
        'The inspection or observation that raised this finding is deleted; restore it instead',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.finding.update({ where: { id }, data: RESTORE_DATA });
      await touchRestoredChildren(tx, { findingIds: [id] });
      await this.audit.record(
        { actor, action: 'RESTORE', entity: 'findings', entityId: id, stadiumId: existing.stadiumId, reason },
        tx,
      );
    });
    return this.get(id, actor);
  }

  /** Called by CorrectiveActionsService so both rows always agree. */
  async syncStatusFromAction(
    tx: Prisma.TransactionClient,
    findingId: string,
    status: FindingDto['status'],
  ): Promise<void> {
    await tx.finding.update({
      where: { id: findingId },
      data: {
        status,
        closedAt: status === 'CLOSED' ? new Date() : null,
      },
    });
  }

  async notifyAssignment(findingId: string, assigneeId: string): Promise<void> {
    const finding = await this.prisma.finding.findUnique({
      where: { id: findingId },
      select: { reference: true, title: true, severity: true },
    });
    if (!finding) return;
    await this.notifications.notify({
      userId: assigneeId,
      kind: 'FINDING_ASSIGNED',
      title: 'A corrective action was assigned to you',
      body: `${finding.reference}: ${finding.title}`,
      route: `/findings/${findingId}`,
      data: { findingId, severity: finding.severity },
    });
  }

  /**
   * `F-<STADIUM CODE>-<00001>`. The counter row is incremented in the same
   * transaction as the finding, so references are gap-free and unique.
   */
  async nextReference(tx: Prisma.TransactionClient, stadiumCode: string): Promise<string> {
    const key = `finding:${stadiumCode}`;
    const counter = await tx.referenceCounter.upsert({
      where: { key },
      create: { key, value: 1 },
      update: { value: { increment: 1 } },
      select: { value: true },
    });
    return `F-${stadiumCode}-${String(counter.value).padStart(5, '0')}`;
  }

  assertInScope(stadiumId: string, actor: RequestUser): void {
    if (!canAccessStadium(actor, stadiumId)) {
      throw AppException.outOfScope();
    }
  }

  async toDto(row: FindingRow): Promise<FindingDto> {
    const evidence = await this.prisma.evidence.findMany({
      where: {
        OR: [
          { context: 'FINDING', contextId: row.id },
          ...(row.inspectionResponseId
            ? [
                {
                  context: 'INSPECTION_RESPONSE' as const,
                  contextId: row.inspectionResponseId,
                },
              ]
            : []),
          ...(row.observationId
            ? [{ context: 'OBSERVATION' as const, contextId: row.observationId }]
            : []),
        ],
      },
      orderBy: { createdAt: 'asc' },
    });

    const actions: CorrectiveActionDto[] = await Promise.all(
      row.actions.map(async (action) => ({
        id: action.id,
        findingId: action.findingId,
        assigneeId: action.assigneeId,
        assigneeName: action.assignee?.fullName ?? null,
        responsibleParty: action.responsibleParty,
        action: action.action,
        dueDate: action.dueDate ? fromDateColumn(action.dueDate) : null,
        status: action.status,
        isOverdue: isOverdue({ status: action.status, dueDate: action.dueDate }),
        startedAt: action.startedAt,
        completedAt: action.completedAt,
        verifiedAt: action.verifiedAt,
        verifiedById: action.verifiedById,
        closureNote: action.closureNote,
        evidence: await this.evidence.hydrateMany(
          await this.prisma.evidence.findMany({
            where: {
              contextId: action.id,
              context: { in: ['CORRECTIVE_ACTION_PROGRESS', 'CORRECTIVE_ACTION_CLOSURE'] },
            },
            orderBy: { createdAt: 'asc' },
          }),
        ),
        createdAt: action.createdAt,
        updatedAt: action.updatedAt,
      })),
    );

    return {
      id: row.id,
      reference: row.reference,
      stadiumId: row.stadiumId,
      stadiumName: row.stadium.name,
      tournamentId: row.tournamentId,
      disciplineId: row.disciplineId,
      source: row.source,
      inspectionId: row.inspectionId,
      inspectionResponseId: row.inspectionResponseId,
      observationId: row.observationId,
      raisedById: row.raisedById,
      raisedByName: row.raisedBy.fullName,
      title: row.title,
      description: row.description,
      severity: row.severity,
      status: row.status,
      isOverdue: actions.some((action) => action.isOverdue),
      localDate: fromDateColumn(row.localDate),
      raisedAt: row.raisedAt,
      closedAt: row.closedAt,
      evidence: await this.evidence.hydrateMany(evidence),
      actions,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      ...softDeleteDto(row),
    };
  }
}

function truncate(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}

function dateRange(from?: string, to?: string): Prisma.DateTimeFilter | undefined {
  if (!from && !to) return undefined;
  return {
    ...(from ? { gte: toDateColumn(from) } : {}),
    ...(to ? { lte: toDateColumn(to) } : {}),
  };
}
