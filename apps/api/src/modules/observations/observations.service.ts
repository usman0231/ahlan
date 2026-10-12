import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  ERROR_CODES,
  observationRaisesFinding,
  zonedDateString,
  type CorrectObservationInput,
  type ListObservationsQuery,
  type Observation as ObservationDto,
  type Paginated,
  type SaveObservationDraftInput,
  type SubmitObservationInput,
} from '@ahlan/shared';

import { PrismaService } from '../../prisma/prisma.service';
import {
  INCLUDING_DELETED,
  LIVE,
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

const observationInclude = {
  stadium: { select: { name: true, code: true, timezone: true } },
  inspector: { select: { fullName: true } },
  discipline: { select: { name: true } },
  // A to-one include cannot carry a where; toDto drops a soft-deleted finding.
  finding: { select: { id: true, deletedAt: true } },
} satisfies Prisma.ObservationInclude;

type ObservationRow = Prisma.ObservationGetPayload<{ include: typeof observationInclude }>;

/**
 * Discipline-based HSE observations.
 *
 * An unsafe act, unsafe condition or near miss raises a finding exactly like a
 * NO answer does. A positive observation is praise: no photo required, no
 * finding raised.
 */
@Injectable()
export class ObservationsService {
  private readonly logger = new Logger(ObservationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly evidence: EvidenceService,
    private readonly findings: FindingsService,
  ) {}

  async list(query: ListObservationsQuery, actor: RequestUser): Promise<Paginated<ObservationDto>> {
    const where: Prisma.ObservationWhereInput = {
      stadiumId: query.stadiumId,
      disciplineId: query.disciplineId,
      inspectorId: query.inspectorId,
      type: query.type,
      severity: query.severity,
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

    const rows = await this.prisma.observation.findMany({
      where,
      include: observationInclude,
      orderBy: { id: 'desc' },
      take: query.limit + 1,
      ...cursorArgs(query.cursor),
    });

    const page = paginateById(rows, query.limit);
    return { ...page, items: await Promise.all(page.items.map((row) => this.toDto(row))) };
  }

  async get(id: string, actor: RequestUser): Promise<ObservationDto> {
    // An admin can still open a soft-deleted observation (to restore it); nobody else can.
    const row = await this.prisma.observation.findFirst({
      where: { id, ...(isAdmin(actor) ? INCLUDING_DELETED : {}) },
      include: observationInclude,
    });
    if (!row) throw AppException.notFound('Observation', id);
    if (!canAccessStadium(actor, row.stadiumId)) {
      throw AppException.outOfScope();
    }
    return this.toDto(row);
  }

  async listMyDrafts(actor: RequestUser): Promise<ObservationDto[]> {
    const rows = await this.prisma.observation.findMany({
      where: { inspectorId: actor.id, status: 'DRAFT' },
      include: observationInclude,
      orderBy: { id: 'desc' },
      take: 50,
    });
    return Promise.all(rows.map((row) => this.toDto(row)));
  }

  /** Saves a draft. Incomplete by design, so the photo rule is not applied yet. */
  async createDraft(input: SubmitObservationInput, actor: RequestUser): Promise<ObservationDto> {
    assertCanEnterFieldData(actor);
    if (!canAccessStadium(actor, input.stadiumId)) throw AppException.outOfScope();
    const context = await this.loadContext(input.stadiumId, input.disciplineId);
    await this.assertNotDeleted(input.id);

    const existing = await this.prisma.observation.findUnique({ where: { id: input.id } });
    if (existing) return this.get(input.id, actor);

    await this.prisma.observation.create({
      data: {
        id: input.id,
        stadiumId: input.stadiumId,
        tournamentId: context.tournamentId,
        disciplineId: input.disciplineId,
        inspectorId: actor.id,
        type: input.type,
        severity: input.severity,
        riskRating: input.riskRating,
        title: input.title,
        description: input.description,
        locationLabel: input.locationLabel ?? null,
        responsibleParty: input.responsibleParty ?? null,
        immediateAction: input.immediateAction ?? null,
        status: 'DRAFT',
        localDate: toDateColumn(zonedDateString(input.observedAt, context.timezone)),
        observedAt: input.observedAt,
        clientCreatedAt: input.clientCreatedAt,
        latitude: input.gps?.latitude ?? null,
        longitude: input.gps?.longitude ?? null,
        gpsAccuracyM: input.gps?.accuracyM ?? null,
        deviceId: input.deviceId ?? null,
        appVersion: input.appVersion ?? null,
      },
    });

    if (input.evidenceIds.length > 0) {
      await this.evidence.attach(input.evidenceIds, 'OBSERVATION', input.id, actor);
    }

    return this.get(input.id, actor);
  }

  async saveDraft(
    id: string,
    input: SaveObservationDraftInput,
    actor: RequestUser,
  ): Promise<ObservationDto> {
    assertCanEnterFieldData(actor);
    await this.assertNotDeleted(id);
    const existing = await this.prisma.observation.findUnique({ where: { id } });
    if (!existing) throw AppException.notFound('Observation', id);
    if (!canAccessStadium(actor, existing.stadiumId)) throw AppException.outOfScope();
    if (existing.inspectorId !== actor.id && actor.role !== 'ADMIN') {
      throw AppException.forbidden('This observation belongs to another inspector');
    }
    if (existing.status === 'SUBMITTED') throw AppException.locked();

    await this.prisma.observation.update({
      where: { id },
      data: {
        disciplineId: input.disciplineId,
        type: input.type,
        severity: input.severity,
        riskRating: input.riskRating,
        title: input.title ?? undefined,
        description: input.description ?? undefined,
        locationLabel: input.locationLabel,
        responsibleParty: input.responsibleParty,
        immediateAction: input.immediateAction,
      },
    });

    if (input.evidenceIds && input.evidenceIds.length > 0) {
      await this.evidence.attach(input.evidenceIds, 'OBSERVATION', id, actor);
    }

    return this.get(id, actor);
  }

  /**
   * Submit. Idempotent on the device-generated id, raises a finding for the
   * unsafe types, and locks the record.
   */
  async submit(input: SubmitObservationInput, actor: RequestUser): Promise<ObservationDto> {
    assertCanEnterFieldData(actor);
    // A soft-deleted observation must not be resurrected by a retried submit.
    await this.assertNotDeleted(input.id);
    const existing = await this.prisma.observation.findUnique({ where: { id: input.id } });
    if (existing?.status === 'SUBMITTED') {
      this.logger.log(`Observation ${input.id} was already submitted; returning the stored copy`);
      return this.get(input.id, actor);
    }
    if (existing && existing.inspectorId !== actor.id && actor.role !== 'ADMIN') {
      throw AppException.forbidden('This observation belongs to another inspector');
    }
    // The guard covers the online route; this covers `/sync/push` too.
    if (!canAccessStadium(actor, input.stadiumId)) throw AppException.outOfScope();

    const context = await this.loadContext(input.stadiumId, input.disciplineId);
    const raisesFinding = observationRaisesFinding(input.type);

    // Attaching first is what proves the photos exist; an unsafe observation
    // without evidence must not be accepted.
    if (input.evidenceIds.length > 0) {
      await this.evidence.attach(input.evidenceIds, 'OBSERVATION', input.id, actor);
    } else if (raisesFinding) {
      throw AppException.badRequest(
        ERROR_CODES.EVIDENCE_REQUIRED,
        'This observation type needs at least one photo',
      );
    }

    const localDate = zonedDateString(input.observedAt, context.timezone);
    const serverReceivedAt = new Date();

    await this.prisma.$transaction(async (tx) => {
      const data = {
        stadiumId: input.stadiumId,
        tournamentId: context.tournamentId,
        disciplineId: input.disciplineId,
        inspectorId: existing?.inspectorId ?? actor.id,
        type: input.type,
        severity: input.severity,
        riskRating: input.riskRating,
        title: input.title,
        description: input.description,
        locationLabel: input.locationLabel ?? null,
        responsibleParty: input.responsibleParty ?? null,
        immediateAction: input.immediateAction ?? null,
        status: 'SUBMITTED' as const,
        localDate: toDateColumn(localDate),
        observedAt: input.observedAt,
        clientCreatedAt: input.clientCreatedAt,
        submittedAt: serverReceivedAt,
        serverReceivedAt,
        latitude: input.gps?.latitude ?? null,
        longitude: input.gps?.longitude ?? null,
        gpsAccuracyM: input.gps?.accuracyM ?? null,
        deviceId: input.deviceId ?? null,
        appVersion: input.appVersion ?? null,
        isLocked: true,
      };

      await tx.observation.upsert({
        where: { id: input.id },
        create: { id: input.id, ...data },
        update: data,
      });

      if (raisesFinding) {
        await this.findings.raiseFromObservation(tx, {
          observationId: input.id,
          stadiumId: input.stadiumId,
          stadiumCode: context.stadiumCode,
          tournamentId: context.tournamentId,
          disciplineId: input.disciplineId,
          localDate,
          raisedAt: serverReceivedAt,
          raisedById: actor.id,
          title: input.title,
          description: input.description,
          severity: input.severity,
        });
      }

      await this.audit.record(
        {
          actor,
          action: 'SUBMIT',
          entity: 'observations',
          entityId: input.id,
          stadiumId: input.stadiumId,
          diff: {
            type: { from: null, to: input.type },
            severity: { from: null, to: input.severity },
          },
        },
        tx,
      );
    });

    return this.get(input.id, actor);
  }

  /** Admin correction on a locked observation. */
  async correct(
    id: string,
    input: CorrectObservationInput,
    actor: RequestUser,
  ): Promise<ObservationDto> {
    assertCanEnterFieldData(actor);
    const existing = await this.prisma.observation.findFirst({
      where: { id, ...INCLUDING_DELETED },
      include: { stadium: { select: { timezone: true } } },
    });
    if (!existing) throw AppException.notFound('Observation', id);
    if (existing.deletedAt) throw AppException.deleted('This observation');
    if (!canAccessStadium(actor, existing.stadiumId)) throw AppException.outOfScope();

    // Changing between "raises a finding" and "positive" would orphan or omit
    // the finding, so the type may only move within its group.
    if (
      input.type &&
      observationRaisesFinding(input.type) !== observationRaisesFinding(existing.type)
    ) {
      throw AppException.validation(
        'The type can only change between unsafe act, unsafe condition and near miss',
        { from: existing.type, to: input.type },
      );
    }
    if (input.disciplineId && input.disciplineId !== existing.disciplineId) {
      const discipline = await this.prisma.discipline.findFirst({
        where: { id: input.disciplineId, deletedAt: null },
        select: { id: true },
      });
      if (!discipline) throw AppException.notFound('Discipline', input.disciplineId);
    }

    const patch = {
      type: input.type,
      disciplineId: input.disciplineId,
      severity: input.severity,
      riskRating: input.riskRating,
      title: input.title,
      description: input.description,
      locationLabel: input.locationLabel ?? undefined,
      responsibleParty: input.responsibleParty ?? undefined,
      immediateAction: input.immediateAction ?? undefined,
      observedAt: input.observedAt,
      // The stadium-local day follows the corrected observation time.
      localDate: input.observedAt
        ? toDateColumn(zonedDateString(input.observedAt, existing.stadium.timezone))
        : undefined,
    };
    const diff = buildDiff(existing, patch as never);

    await this.prisma.$transaction(async (tx) => {
      await tx.observation.update({ where: { id }, data: patch });

      // Keep the finding's copy of the text in step with the correction.
      if (input.severity || input.title || input.description || input.disciplineId) {
        await tx.finding.updateMany({
          where: { observationId: id },
          data: {
            severity: input.severity,
            title: input.title,
            description: input.description,
            disciplineId: input.disciplineId,
          },
        });
      }

      await this.audit.record(
        {
          actor,
          action: 'ADMIN_CORRECTION',
          entity: 'observations',
          entityId: id,
          stadiumId: existing.stadiumId,
          reason: input.reason,
          diff: hasChanges(diff) ? diff : null,
        },
        tx,
      );
    });

    return this.get(id, actor);
  }

  /**
   * Admin soft delete of a submitted observation; the finding it raised goes
   * with it (same timestamp), so restore brings exactly that one back.
   */
  async softDelete(id: string, reason: string, actor: RequestUser): Promise<void> {
    const existing = await this.prisma.observation.findFirst({
      where: { id, ...INCLUDING_DELETED },
      select: { id: true, stadiumId: true, status: true, deletedAt: true },
    });
    if (!existing) throw AppException.notFound('Observation', id);
    if (existing.deletedAt) throw AppException.conflict('This observation is already deleted');
    if (existing.status !== 'SUBMITTED') {
      throw AppException.conflict('Only a submitted observation can be deleted');
    }

    const data = softDeleteData(actor.id, reason);
    await this.prisma.$transaction(async (tx) => {
      await tx.observation.update({ where: { id }, data });
      const findings = await tx.finding.updateMany({
        where: { observationId: id, ...LIVE },
        data,
      });
      await this.audit.record(
        {
          actor,
          action: 'DELETE',
          entity: 'observations',
          entityId: id,
          stadiumId: existing.stadiumId,
          reason,
          diff: { findingsDeleted: { from: 0, to: findings.count } },
        },
        tx,
      );
    });
  }

  async restore(id: string, reason: string, actor: RequestUser): Promise<ObservationDto> {
    const existing = await this.prisma.observation.findFirst({
      where: { id, ...ONLY_DELETED },
      select: { id: true, stadiumId: true, deletedAt: true },
    });
    if (!existing) {
      if ((await this.prisma.observation.count({ where: { id } })) > 0) {
        throw AppException.conflict('This observation is not deleted');
      }
      throw AppException.notFound('Observation', id);
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.observation.update({ where: { id }, data: RESTORE_DATA });
      const cascaded = { observationId: id, deletedAt: existing.deletedAt };
      const findingIds = (await tx.finding.findMany({ where: cascaded, select: { id: true } })).map(
        (row) => row.id,
      );
      const findings = await tx.finding.updateMany({ where: cascaded, data: RESTORE_DATA });
      await touchRestoredChildren(tx, { observationIds: [id], findingIds });
      await this.audit.record(
        {
          actor,
          action: 'RESTORE',
          entity: 'observations',
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

  private async assertNotDeleted(id: string): Promise<void> {
    const deleted = await this.prisma.observation.count({ where: { id, ...ONLY_DELETED } });
    if (deleted > 0) throw AppException.deleted('This observation');
  }

  private async loadContext(
    stadiumId: string,
    disciplineId: string,
  ): Promise<{ timezone: string; stadiumCode: string; tournamentId: string | null }> {
    const stadium = await this.prisma.stadium.findFirst({
      where: { id: stadiumId, deletedAt: null },
      select: { timezone: true, code: true },
    });
    if (!stadium) throw AppException.notFound('Stadium', stadiumId);

    const discipline = await this.prisma.discipline.findFirst({
      where: { id: disciplineId, isActive: true },
      select: { id: true },
    });
    if (!discipline) throw AppException.notFound('Discipline', disciplineId);

    const tournament = await this.prisma.tournament.findFirst({
      where: { isActive: true },
      select: { id: true },
    });

    return {
      timezone: stadium.timezone,
      stadiumCode: stadium.code,
      tournamentId: tournament?.id ?? null,
    };
  }

  private async toDto(row: ObservationRow): Promise<ObservationDto> {
    const evidenceRows = await this.prisma.evidence.findMany({
      where: { context: 'OBSERVATION', contextId: row.id },
      orderBy: { createdAt: 'asc' },
    });

    return {
      id: row.id,
      stadiumId: row.stadiumId,
      tournamentId: row.tournamentId,
      disciplineId: row.disciplineId,
      disciplineName: row.discipline.name,
      inspectorId: row.inspectorId,
      inspectorName: row.inspector.fullName,
      type: row.type,
      severity: row.severity,
      riskRating: row.riskRating,
      title: row.title,
      description: row.description,
      locationLabel: row.locationLabel,
      responsibleParty: row.responsibleParty,
      immediateAction: row.immediateAction,
      status: row.status,
      localDate: fromDateColumn(row.localDate),
      observedAt: row.observedAt,
      clientCreatedAt: row.clientCreatedAt,
      submittedAt: row.submittedAt,
      serverReceivedAt: row.serverReceivedAt,
      gps:
        row.latitude !== null && row.longitude !== null
          ? { latitude: row.latitude, longitude: row.longitude, accuracyM: row.gpsAccuracyM }
          : null,
      evidence: await this.evidence.hydrateMany(evidenceRows),
      findingId: row.finding && !row.finding.deletedAt ? row.finding.id : null,
      isLocked: row.isLocked,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      ...softDeleteDto(row),
    };
  }
}

function dateRange(from?: string, to?: string): Prisma.DateTimeFilter | undefined {
  if (!from && !to) return undefined;
  return {
    ...(from ? { gte: toDateColumn(from) } : {}),
    ...(to ? { lte: toDateColumn(to) } : {}),
  };
}
