import { Injectable, Logger } from '@nestjs/common';
import { Prisma, type ResponseValue, type Severity } from '@prisma/client';
import {
  ERROR_CODES,
  compliancePercent,
  isChecklistComplete,
  tallyResponses,
  zonedDateString,
  type CorrectInspectionInput,
  type CreateInspectionInput,
  type Inspection as InspectionDto,
  type InspectionResponseInput,
  type InspectionWithResponses,
  type ListInspectionsQuery,
  type Paginated,
  type SaveInspectionDraftInput,
  type SubmitInspectionInput,
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
  assertCanEnterFieldData,
  canAccessStadium,
  isAdmin,
  isStadiumScoped,
  stadiumScopeWhere,
  type RequestUser,
} from '../../common/types/request-user';
import { AuditService } from '../audit/audit.service';
import { EvidenceService } from '../evidence/evidence.service';
import { FindingsService } from '../findings/findings.service';

const inspectionInclude = {
  stadium: { select: { name: true, code: true, timezone: true } },
  inspector: { select: { fullName: true } },
  checklist: { select: { title: true, disciplineId: true } },
  checklistVersion: { select: { version: true, itemCount: true } },
  responses: { orderBy: { itemCode: 'asc' }, include: { item: { select: { question: true } } } },
} satisfies Prisma.InspectionInclude;

type InspectionRow = Prisma.InspectionGetPayload<{ include: typeof inspectionInclude }>;

@Injectable()
export class InspectionsService {
  private readonly logger = new Logger(InspectionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly evidence: EvidenceService,
    private readonly findings: FindingsService,
  ) {}

  /* ------------------------------- reads -------------------------------- */

  async list(query: ListInspectionsQuery, actor: RequestUser): Promise<Paginated<InspectionDto>> {
    const where: Prisma.InspectionWhereInput = {
      stadiumId: query.stadiumId,
      inspectorId: query.inspectorId,
      checklistId: query.checklistId,
      status: query.status,
      tournamentId: query.tournamentId,
      localDate: dateRange(query.from, query.to),
      ...stadiumScopeWhere(actor),
      ...deletedAtFilter(isAdmin(actor) && query.includeDeleted),
    };

    if (isStadiumScoped(actor) && query.stadiumId) {
      if (!actor.stadiumIds.includes(query.stadiumId)) throw AppException.outOfScope();
      where.stadiumId = query.stadiumId;
    }

    const rows = await this.prisma.inspection.findMany({
      where,
      include: inspectionInclude,
      orderBy: { id: 'desc' },
      take: query.limit + 1,
      ...cursorArgs(query.cursor),
    });

    const page = paginateById(rows, query.limit);
    return { ...page, items: page.items.map(toSummaryDto) };
  }

  async get(id: string, actor: RequestUser): Promise<InspectionWithResponses> {
    // An admin can still open a soft-deleted inspection (to restore it); nobody else can.
    const row = await this.prisma.inspection.findFirst({
      where: { id, ...(isAdmin(actor) ? INCLUDING_DELETED : {}) },
      include: inspectionInclude,
    });
    if (!row) throw AppException.notFound('Inspection', id);
    this.assertInScope(row.stadiumId, actor);
    return this.toFullDto(row);
  }

  /** The inspector's own drafts, so an interrupted inspection can be resumed. */
  async listMyDrafts(actor: RequestUser): Promise<InspectionDto[]> {
    const rows = await this.prisma.inspection.findMany({
      where: { inspectorId: actor.id, status: 'DRAFT' },
      include: inspectionInclude,
      orderBy: { id: 'desc' },
      take: 50,
    });
    return rows.map(toSummaryDto);
  }

  /* ------------------------------- writes ------------------------------- */

  /** Creates the draft shell the moment the inspector taps Start. */
  async create(input: CreateInspectionInput, actor: RequestUser): Promise<InspectionWithResponses> {
    assertCanEnterFieldData(actor);
    this.assertInScope(input.stadiumId, actor);
    const context = await this.loadContext(input.stadiumId, input.checklistVersionId);
    await this.assertNotDeleted(input.id);

    const existing = await this.prisma.inspection.findUnique({ where: { id: input.id } });
    if (existing) {
      // The device retried a create it had already made.
      return this.get(input.id, actor);
    }

    await this.prisma.inspection.create({
      data: {
        id: input.id,
        stadiumId: input.stadiumId,
        tournamentId: context.tournamentId,
        checklistId: input.checklistId,
        checklistVersionId: input.checklistVersionId,
        inspectorId: actor.id,
        status: 'DRAFT',
        localDate: toDateColumn(zonedDateString(input.startedAt, context.timezone)),
        startedAt: input.startedAt,
        clientCreatedAt: input.clientCreatedAt,
        latitude: input.gps?.latitude ?? null,
        longitude: input.gps?.longitude ?? null,
        gpsAccuracyM: input.gps?.accuracyM ?? null,
        deviceId: input.deviceId ?? null,
        appVersion: input.appVersion ?? null,
        notes: input.notes ?? null,
        locationLabel: input.locationLabel ?? null,
        otherObservations: input.otherObservations ?? null,
      },
    });

    return this.get(input.id, actor);
  }

  /** Drafts are replaced wholesale, which makes a retried save harmless. */
  async saveDraft(
    id: string,
    input: SaveInspectionDraftInput,
    actor: RequestUser,
  ): Promise<InspectionWithResponses> {
    assertCanEnterFieldData(actor);
    await this.assertNotDeleted(id);
    const inspection = await this.prisma.inspection.findUnique({ where: { id } });
    if (!inspection) throw AppException.notFound('Inspection', id);
    this.assertInScope(inspection.stadiumId, actor);
    if (inspection.inspectorId !== actor.id && actor.role !== 'ADMIN') {
      throw AppException.forbidden('This inspection belongs to another inspector');
    }
    if (inspection.status === 'SUBMITTED') throw AppException.locked();

    const items = await this.loadVersionItems(inspection.checklistVersionId);
    this.assertItemsBelong(input.responses, items);

    await this.prisma.$transaction(async (tx) => {
      await tx.inspectionResponse.deleteMany({ where: { inspectionId: id } });
      if (input.responses.length > 0) {
        await tx.inspectionResponse.createMany({
          data: input.responses.map((response) => ({
            id: response.id,
            inspectionId: id,
            itemId: response.itemId,
            itemCode: items.get(response.itemId)?.code ?? '',
            value: response.value,
            comment: response.comment ?? null,
            concern: response.concern ?? null,
            recommendation: response.recommendation ?? null,
            severity: response.severity ?? null,
            answeredAt: response.answeredAt,
          })),
        });
      }

      const tally = tallyResponses(input.responses.map((response) => response.value));
      await tx.inspection.update({
        where: { id },
        data: {
          notes: input.notes ?? null,
          locationLabel: input.locationLabel ?? null,
          otherObservations: input.otherObservations ?? null,
          yesCount: tally.yes,
          noCount: tally.no,
          naCount: tally.na,
          compliancePercent: toDecimal(compliancePercent(tally)),
        },
      });
    });

    // Draft photos are linked now so they survive even if submit never happens.
    for (const response of input.responses) {
      if (response.evidenceIds.length > 0) {
        await this.evidence.attach(
          response.evidenceIds,
          'INSPECTION_RESPONSE',
          response.id,
          actor,
        );
      }
    }

    return this.get(id, actor);
  }

  /**
   * Submit. Carries the whole answer set so a device that was offline can create
   * and submit in one call.
   *
   * What happens here, in order:
   *   1. the checklist version is re-read and every answer checked against it
   *   2. the checklist must be complete - no half-finished submissions
   *   3. photos are attached, which is where the "NO needs a photo" rule bites
   *   4. compliance is recomputed from the stored answers, never taken from the
   *      client
   *   5. every NO raises exactly one finding
   *   6. the inspection is locked
   */
  async submit(
    input: SubmitInspectionInput,
    actor: RequestUser,
  ): Promise<InspectionWithResponses> {
    assertCanEnterFieldData(actor);
    // A soft-deleted inspection must not be resurrected by a retried submit.
    await this.assertNotDeleted(input.id);
    const existing = await this.prisma.inspection.findUnique({ where: { id: input.id } });
    if (existing?.status === 'SUBMITTED') {
      // Idempotent: the device is retrying a submit that already landed.
      this.logger.log(`Inspection ${input.id} was already submitted; returning the stored copy`);
      return this.get(input.id, actor);
    }
    if (existing && existing.inspectorId !== actor.id && actor.role !== 'ADMIN') {
      throw AppException.forbidden('This inspection belongs to another inspector');
    }
    // The guard covers the online route; this covers `/sync/push` too.
    this.assertInScope(input.stadiumId, actor);

    const context = await this.loadContext(input.stadiumId, input.checklistVersionId);
    const items = await this.loadVersionItems(input.checklistVersionId);
    this.assertItemsBelong(input.responses, items);

    if (!isChecklistComplete(new Set(input.responses.map((r) => r.itemId)).size, items.size)) {
      throw AppException.badRequest(
        ERROR_CODES.INCOMPLETE_CHECKLIST,
        `All ${items.size} checklist items must be answered before submitting`,
        { answered: input.responses.length, total: items.size },
      );
    }

    // NA is only allowed where the item permits it.
    const naNotAllowed = input.responses.filter(
      (response) => response.value === 'NA' && items.get(response.itemId)?.allowNa === false,
    );
    if (naNotAllowed.length > 0) {
      throw AppException.validation('Some items cannot be answered "Not applicable"', {
        items: naNotAllowed.map((response) => items.get(response.itemId)?.code),
      });
    }

    // Attached before the transaction: `attach` is what verifies the photos
    // really exist and really are uploaded, and a NO without one must fail.
    for (const response of input.responses) {
      if (response.evidenceIds.length > 0) {
        await this.evidence.attach(
          response.evidenceIds,
          'INSPECTION_RESPONSE',
          response.id,
          actor,
        );
      } else if (response.value === 'NO') {
        throw AppException.badRequest(
          ERROR_CODES.EVIDENCE_REQUIRED,
          `Item ${items.get(response.itemId)?.code ?? ''} is answered "No" and needs a photo`,
        );
      }
    }

    const tally = tallyResponses(input.responses.map((response) => response.value));
    const compliance = compliancePercent(tally);
    const localDate = zonedDateString(input.submittedAt, context.timezone);
    const serverReceivedAt = new Date();

    await this.prisma.$transaction(async (tx) => {
      const data = {
        stadiumId: input.stadiumId,
        tournamentId: context.tournamentId,
        checklistId: input.checklistId,
        checklistVersionId: input.checklistVersionId,
        inspectorId: existing?.inspectorId ?? actor.id,
        status: 'SUBMITTED' as const,
        localDate: toDateColumn(localDate),
        startedAt: input.startedAt,
        clientCreatedAt: input.clientCreatedAt,
        submittedAt: input.submittedAt,
        serverReceivedAt,
        latitude: input.gps?.latitude ?? null,
        longitude: input.gps?.longitude ?? null,
        gpsAccuracyM: input.gps?.accuracyM ?? null,
        deviceId: input.deviceId ?? null,
        appVersion: input.appVersion ?? null,
        notes: input.notes ?? null,
        // Keep a header captured on the draft if the submit payload omits it.
        locationLabel: input.locationLabel ?? existing?.locationLabel ?? null,
        otherObservations: input.otherObservations ?? existing?.otherObservations ?? null,
        yesCount: tally.yes,
        noCount: tally.no,
        naCount: tally.na,
        compliancePercent: toDecimal(compliance),
        isLocked: true,
      };

      await tx.inspection.upsert({
        where: { id: input.id },
        create: { id: input.id, ...data },
        update: data,
      });

      // Replace the answers wholesale so a resubmitted draft cannot leave
      // stale rows behind.
      await tx.inspectionResponse.deleteMany({ where: { inspectionId: input.id } });
      await tx.inspectionResponse.createMany({
        data: input.responses.map((response) => ({
          id: response.id,
          inspectionId: input.id,
          itemId: response.itemId,
          itemCode: items.get(response.itemId)?.code ?? '',
          value: response.value,
          comment: response.comment ?? null,
          concern: response.concern ?? null,
          recommendation: response.recommendation ?? null,
          severity: response.severity ?? null,
          answeredAt: response.answeredAt,
        })),
      });

      for (const response of input.responses) {
        if (response.value !== 'NO') continue;
        const item = items.get(response.itemId);
        if (!item) continue;

        await this.findings.raiseFromInspectionResponse(tx, {
          responseId: response.id,
          inspectionId: input.id,
          stadiumId: input.stadiumId,
          stadiumCode: context.stadiumCode,
          tournamentId: context.tournamentId,
          disciplineId: context.disciplineId,
          localDate,
          raisedAt: serverReceivedAt,
          raisedById: actor.id,
          itemCode: item.code,
          question: item.question,
          // The readiness sheet's "Concern / observation" is the finding's
          // detail; older builds only send a comment.
          comment: response.concern ?? response.comment ?? null,
          // The inspector may raise the severity above the item default.
          severity: (response.severity ?? item.defaultSeverity) as Severity,
          evidenceIds: response.evidenceIds,
        });
      }

      await this.audit.record(
        {
          actor,
          action: 'SUBMIT',
          entity: 'inspections',
          entityId: input.id,
          stadiumId: input.stadiumId,
          diff: {
            compliancePercent: { from: null, to: compliance },
            answers: { from: null, to: tally },
          },
        },
        tx,
      );
    });

    return this.get(input.id, actor);
  }

  /**
   * The explicit admin override on a locked record. Recomputes compliance from
   * the corrected answers and writes the before/after to the audit log.
   */
  async correct(
    id: string,
    input: CorrectInspectionInput,
    actor: RequestUser,
  ): Promise<InspectionWithResponses> {
    const inspection = await this.prisma.inspection.findFirst({
      where: { id, ...INCLUDING_DELETED },
      include: { responses: true },
    });
    if (!inspection) throw AppException.notFound('Inspection', id);
    if (inspection.deletedAt) throw AppException.deleted('This inspection');

    const byId = new Map(inspection.responses.map((response) => [response.id, response]));
    for (const change of input.responses) {
      if (!byId.has(change.id)) {
        throw AppException.validation(`Response ${change.id} is not part of this inspection`);
      }
    }

    const nextValues = new Map<string, ResponseValue>(
      inspection.responses.map((response) => [response.id, response.value]),
    );
    for (const change of input.responses) nextValues.set(change.id, change.value);

    const tally = tallyResponses([...nextValues.values()]);
    const compliance = compliancePercent(tally);

    const diff = buildDiff(
      {
        notes: inspection.notes,
        locationLabel: inspection.locationLabel,
        otherObservations: inspection.otherObservations,
        yesCount: inspection.yesCount,
        noCount: inspection.noCount,
        naCount: inspection.naCount,
        compliancePercent: inspection.compliancePercent,
      },
      {
        notes: input.notes ?? inspection.notes,
        locationLabel: input.locationLabel ?? inspection.locationLabel,
        otherObservations: input.otherObservations ?? inspection.otherObservations,
        yesCount: tally.yes,
        noCount: tally.no,
        naCount: tally.na,
        compliancePercent: toDecimal(compliance),
      } as never,
    );

    await this.prisma.$transaction(async (tx) => {
      for (const change of input.responses) {
        await tx.inspectionResponse.update({
          where: { id: change.id },
          data: {
            value: change.value,
            comment: change.comment ?? undefined,
            concern: change.concern ?? undefined,
            recommendation: change.recommendation ?? undefined,
            severity: change.severity ?? undefined,
          },
        });
      }

      await tx.inspection.update({
        where: { id },
        data: {
          notes: input.notes ?? inspection.notes,
          locationLabel: input.locationLabel ?? inspection.locationLabel,
          otherObservations: input.otherObservations ?? inspection.otherObservations,
          yesCount: tally.yes,
          noCount: tally.no,
          naCount: tally.na,
          compliancePercent: toDecimal(compliance),
        },
      });

      await this.audit.record(
        {
          actor,
          action: 'ADMIN_CORRECTION',
          entity: 'inspections',
          entityId: id,
          stadiumId: inspection.stadiumId,
          reason: input.reason,
          diff: hasChanges(diff) ? diff : null,
        },
        tx,
      );
    });

    return this.get(id, actor);
  }

  /**
   * Admin soft delete of a submitted inspection. The findings it raised go with
   * it (same timestamp and reason), so restore can bring exactly those back.
   */
  async softDelete(id: string, reason: string, actor: RequestUser): Promise<void> {
    const existing = await this.prisma.inspection.findFirst({
      where: { id, ...INCLUDING_DELETED },
      select: { id: true, stadiumId: true, status: true, deletedAt: true },
    });
    if (!existing) throw AppException.notFound('Inspection', id);
    if (existing.deletedAt) throw AppException.conflict('This inspection is already deleted');
    if (existing.status !== 'SUBMITTED') {
      throw AppException.conflict('Only a submitted inspection can be deleted');
    }

    const data = softDeleteData(actor.id, reason);
    await this.prisma.$transaction(async (tx) => {
      await tx.inspection.update({ where: { id }, data });
      const findings = await tx.finding.updateMany({ where: { inspectionId: id, deletedAt: null }, data });
      await this.audit.record(
        {
          actor,
          action: 'DELETE',
          entity: 'inspections',
          entityId: id,
          stadiumId: existing.stadiumId,
          reason,
          diff: { findingsDeleted: { from: 0, to: findings.count } },
        },
        tx,
      );
    });
  }

  async restore(id: string, reason: string, actor: RequestUser): Promise<InspectionWithResponses> {
    const existing = await this.prisma.inspection.findFirst({
      where: { id, ...ONLY_DELETED },
      select: { id: true, stadiumId: true, deletedAt: true },
    });
    if (!existing) {
      if ((await this.prisma.inspection.count({ where: { id } })) > 0) {
        throw AppException.conflict('This inspection is not deleted');
      }
      throw AppException.notFound('Inspection', id);
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.inspection.update({ where: { id }, data: RESTORE_DATA });
      // Only the findings that were deleted together with the inspection.
      const cascaded = { inspectionId: id, deletedAt: existing.deletedAt };
      const findingIds = (await tx.finding.findMany({ where: cascaded, select: { id: true } })).map(
        (row) => row.id,
      );
      const findings = await tx.finding.updateMany({ where: cascaded, data: RESTORE_DATA });
      await touchRestoredChildren(tx, { inspectionIds: [id], findingIds });
      await this.audit.record(
        {
          actor,
          action: 'RESTORE',
          entity: 'inspections',
          entityId: id,
          stadiumId: existing.stadiumId,
          reason,
          diff: { findingsRestored: { from: 0, to: findings.count } },
        },
        tx,
      );
    });
    return this.get(id, actor);
  }

  /* ----------------------------- internals ----------------------------- */

  private async assertNotDeleted(id: string): Promise<void> {
    const deleted = await this.prisma.inspection.count({ where: { id, ...ONLY_DELETED } });
    if (deleted > 0) throw AppException.deleted('This inspection');
  }

  private async loadContext(
    stadiumId: string,
    checklistVersionId: string,
  ): Promise<{
    timezone: string;
    stadiumCode: string;
    tournamentId: string | null;
    disciplineId: string | null;
  }> {
    const stadium = await this.prisma.stadium.findFirst({
      where: { id: stadiumId, deletedAt: null },
      select: { timezone: true, code: true },
    });
    if (!stadium) throw AppException.notFound('Stadium', stadiumId);

    const version = await this.prisma.checklistVersion.findUnique({
      where: { id: checklistVersionId },
      select: { checklist: { select: { disciplineId: true } } },
    });
    if (!version) throw AppException.notFound('Checklist version', checklistVersionId);

    const tournament = await this.prisma.tournament.findFirst({
      where: { isActive: true },
      select: { id: true },
    });

    return {
      timezone: stadium.timezone,
      stadiumCode: stadium.code,
      tournamentId: tournament?.id ?? null,
      disciplineId: version.checklist.disciplineId,
    };
  }

  private async loadVersionItems(versionId: string) {
    const sections = await this.prisma.checklistSection.findMany({
      where: { versionId },
      include: { items: true },
    });
    const items = new Map<
      string,
      { code: string; question: string; defaultSeverity: Severity; allowNa: boolean }
    >();
    for (const section of sections) {
      for (const item of section.items) {
        items.set(item.id, {
          code: item.code,
          question: item.question,
          defaultSeverity: item.defaultSeverity,
          allowNa: item.allowNa,
        });
      }
    }
    if (items.size === 0) {
      throw AppException.badRequest(
        ERROR_CODES.CHECKLIST_VERSION_MISMATCH,
        'This checklist version has no items',
      );
    }
    return items;
  }

  /** Guards against a stale app answering items from a different version. */
  private assertItemsBelong(
    responses: InspectionResponseInput[],
    items: Map<string, unknown>,
  ): void {
    const unknown = responses.filter((response) => !items.has(response.itemId));
    if (unknown.length > 0) {
      throw AppException.badRequest(
        ERROR_CODES.CHECKLIST_VERSION_MISMATCH,
        'Some answers do not belong to this checklist version. Please refresh your checklists.',
        { itemIds: unknown.map((response) => response.itemId) },
      );
    }

    const seen = new Set<string>();
    for (const response of responses) {
      if (seen.has(response.itemId)) {
        throw AppException.validation('An item was answered twice', { itemId: response.itemId });
      }
      seen.add(response.itemId);
    }
  }

  private assertInScope(stadiumId: string, actor: RequestUser): void {
    if (!canAccessStadium(actor, stadiumId)) {
      throw AppException.outOfScope();
    }
  }

  private async toFullDto(row: InspectionRow): Promise<InspectionWithResponses> {
    const evidenceRows = await this.prisma.evidence.findMany({
      where: {
        context: 'INSPECTION_RESPONSE',
        contextId: { in: row.responses.map((response) => response.id) },
      },
      orderBy: { createdAt: 'asc' },
    });
    const hydrated = await this.evidence.hydrateMany(evidenceRows);
    const byResponse = new Map<string, typeof hydrated>();
    for (const item of hydrated) {
      if (!item.contextId) continue;
      const bucket = byResponse.get(item.contextId) ?? [];
      bucket.push(item);
      byResponse.set(item.contextId, bucket);
    }

    const findingCount = await this.prisma.finding.count({ where: { inspectionId: row.id } });

    return {
      ...toSummaryDto(row),
      findingCount,
      responses: row.responses.map((response) => ({
        id: response.id,
        inspectionId: response.inspectionId,
        itemId: response.itemId,
        itemCode: response.itemCode,
        value: response.value,
        comment: response.comment,
        concern: response.concern,
        recommendation: response.recommendation,
        severity: response.severity,
        evidence: byResponse.get(response.id) ?? [],
        answeredAt: response.answeredAt,
      })),
    };
  }
}

function toSummaryDto(row: InspectionRow): InspectionDto {
  return {
    id: row.id,
    stadiumId: row.stadiumId,
    tournamentId: row.tournamentId,
    checklistId: row.checklistId,
    checklistVersionId: row.checklistVersionId,
    checklistVersion: row.checklistVersion.version,
    checklistTitle: row.checklist.title,
    inspectorId: row.inspectorId,
    inspectorName: row.inspector.fullName,
    status: row.status,
    localDate: fromDateColumn(row.localDate),
    startedAt: row.startedAt,
    clientCreatedAt: row.clientCreatedAt,
    submittedAt: row.submittedAt,
    serverReceivedAt: row.serverReceivedAt,
    gps:
      row.latitude !== null && row.longitude !== null
        ? { latitude: row.latitude, longitude: row.longitude, accuracyM: row.gpsAccuracyM }
        : null,
    yesCount: row.yesCount,
    naCount: row.naCount,
    noCount: row.noCount,
    compliancePercent: row.compliancePercent === null ? null : Number(row.compliancePercent),
    notes: row.notes,
    locationLabel: row.locationLabel,
    otherObservations: row.otherObservations,
    findingCount: 0,
    isLocked: row.isLocked,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    ...softDeleteDto(row),
  };
}

/** Percentages are stored as `decimal(5,2)`; null means "no answerable items". */
function toDecimal(value: number | null): Prisma.Decimal | null {
  return value === null ? null : new Prisma.Decimal(value.toFixed(2));
}

function dateRange(from?: string, to?: string): Prisma.DateTimeFilter | undefined {
  if (!from && !to) return undefined;
  return {
    ...(from ? { gte: toDateColumn(from) } : {}),
    ...(to ? { lte: toDateColumn(to) } : {}),
  };
}
