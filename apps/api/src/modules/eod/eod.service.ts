import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  eodWorkforceTotals,
  ERROR_CODES,
  isAllowedEodReportDate,
  resolveEodIncidentStats,
  toDecimalString,
  uuidv7,
  workforceManHours,
  type EodWorkforceEntryInput,
  type CorrectEodInput,
  type EodComplianceRow,
  type EodReport as EodReportDto,
  type ListEodQuery,
  type Paginated,
  type SaveEodDraftInput,
  type SubmitEodInput,
} from '@ahlan/shared';

import {
  INCLUDING_DELETED,
  ONLY_DELETED,
  RESTORE_DATA,
  deletedAtFilter,
  softDeleteData,
  softDeleteDto,
} from '../../prisma/soft-delete';
import { touchRestoredChildren } from '../../prisma/soft-delete-queries';

import { PrismaService } from '../../prisma/prisma.service';
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
import { EodWindowsService } from './eod-windows.service';

const eodInclude = {
  stadium: { select: { name: true, timezone: true } },
  inspector: { select: { fullName: true } },
  workforce: { orderBy: { sortOrder: 'asc' } },
} satisfies Prisma.EodReportInclude;

type EodRow = Prisma.EodReportGetPayload<{ include: typeof eodInclude }>;

/** `deletedSlot` of a live report (see schema.prisma). */
const LIVE_SLOT = '';

/**
 * End-of-Day reports: one per inspector, per stadium, per stadium-local day.
 *
 * Two rules do the heavy lifting here. Submission is only accepted while the
 * admin's window for that date is open, and the unique constraint on
 * (stadium, inspector, date) means a retried sync updates the draft rather than
 * creating a second report.
 */
@Injectable()
export class EodService {
  private readonly logger = new Logger(EodService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly windows: EodWindowsService,
    private readonly audit: AuditService,
    private readonly evidence: EvidenceService,
  ) {}

  async list(query: ListEodQuery, actor: RequestUser): Promise<Paginated<EodReportDto>> {
    const where: Prisma.EodReportWhereInput = {
      stadiumId: query.stadiumId,
      inspectorId: query.inspectorId,
      status: query.status,
      tournamentId: query.tournamentId,
      date: dateRange(query.from, query.to),
      ...stadiumScopeWhere(actor),
      // Soft-deleted reports only for an admin who asked for them.
      ...deletedAtFilter(isAdmin(actor) && query.includeDeleted),
    };

    if (isStadiumScoped(actor) && query.stadiumId) {
      if (!actor.stadiumIds.includes(query.stadiumId)) throw AppException.outOfScope();
      where.stadiumId = query.stadiumId;
    }

    const rows = await this.prisma.eodReport.findMany({
      where,
      include: eodInclude,
      orderBy: { id: 'desc' },
      take: query.limit + 1,
      ...cursorArgs(query.cursor),
    });

    const page = paginateById(rows, query.limit);
    return { ...page, items: page.items.map(toDto) };
  }

  async get(id: string, actor: RequestUser): Promise<EodReportDto> {
    // An admin can still open a soft-deleted report (to restore it); nobody else can.
    const row = await this.prisma.eodReport.findFirst({
      where: { id, ...(isAdmin(actor) ? INCLUDING_DELETED : {}) },
      include: eodInclude,
    });
    if (!row) throw AppException.notFound('EOD report', id);
    if (!canAccessStadium(actor, row.stadiumId)) {
      throw AppException.outOfScope();
    }
    return toDto(row);
  }

  /** The caller's report for a stadium and date, draft or submitted. */
  async getMine(stadiumId: string, date: string, actor: RequestUser): Promise<EodReportDto | null> {
    const row = await this.prisma.eodReport.findUnique({
      where: {
        stadiumId_inspectorId_date_deletedSlot: {
          deletedSlot: LIVE_SLOT,
          stadiumId,
          inspectorId: actor.id,
          date: toDateColumn(date),
        },
      },
      include: eodInclude,
    });
    return row ? toDto(row) : null;
  }

  /**
   * Draft save. Deliberately not window-checked: an inspector should be able to
   * fill the report in through the day and only be gated at submit.
   */
  async saveDraft(input: SaveEodDraftInput, actor: RequestUser): Promise<EodReportDto> {
    if (!input.stadiumId || !input.date) {
      throw AppException.validation('stadiumId and date are required to save a draft');
    }
    assertCanEnterFieldData(actor);
    if (!canAccessStadium(actor, input.stadiumId)) throw AppException.outOfScope();

    const context = await this.loadContext(input.stadiumId);
    await this.assertNotDeleted(input.id);
    const existing = await this.prisma.eodReport.findUnique({
      where: {
        stadiumId_inspectorId_date_deletedSlot: {
          deletedSlot: LIVE_SLOT,
          stadiumId: input.stadiumId,
          inspectorId: actor.id,
          date: toDateColumn(input.date),
        },
      },
    });
    if (existing?.status === 'SUBMITTED') throw AppException.locked();

    const totals = eodWorkforceTotals(input.workforce);
    const id = existing?.id ?? input.id;

    await this.prisma.$transaction(async (tx) => {
      const data = {
        stadiumId: input.stadiumId as string,
        tournamentId: context.tournamentId,
        inspectorId: actor.id,
        date: toDateColumn(input.date as string),
        status: 'DRAFT' as const,
        totalHeadcount: totals.totalHeadcount,
        totalManHours: new Prisma.Decimal(totals.totalManHours),
        ...formFields(input),
        clientCreatedAt: existing?.clientCreatedAt ?? new Date(),
      };

      await tx.eodReport.upsert({
        where: { id },
        create: { id, ...data },
        update: data,
      });

      await writeWorkforce(tx, id, input.workforce);
    });

    if (input.evidenceIds.length > 0) {
      await this.evidence.attach(input.evidenceIds, 'EOD', id, actor);
    }

    return this.get(id, actor);
  }

  /**
   * Submit. Rejected outside an open window, and only one report per inspector,
   * per stadium, per stadium-local day is ever accepted.
   */
  async submit(input: SubmitEodInput, actor: RequestUser): Promise<EodReportDto> {
    assertCanEnterFieldData(actor);
    // The guard covers the online route; this covers `/sync/push` too.
    if (!canAccessStadium(actor, input.stadiumId)) throw AppException.outOfScope();
    const context = await this.loadContext(input.stadiumId);
    await this.assertNotDeleted(input.id);

    const existing = await this.prisma.eodReport.findUnique({
      where: {
        stadiumId_inspectorId_date_deletedSlot: {
          deletedSlot: LIVE_SLOT,
          stadiumId: input.stadiumId,
          inspectorId: actor.id,
          date: toDateColumn(input.date),
        },
      },
    });

    if (existing?.status === 'SUBMITTED') {
      throw AppException.conflict(
        'You have already submitted an EOD report for this stadium and date',
        ERROR_CODES.EOD_ALREADY_SUBMITTED,
      );
    }

    const now = new Date();
    if (!isAllowedEodReportDate(input.date, context.timezone, now)) {
      throw AppException.badRequest(
        ERROR_CODES.EOD_DATE_NOT_ALLOWED,
        'An EOD report can only be submitted for today or yesterday (stadium time)',
        { date: input.date },
      );
    }

    // Judged at the moment of submission, not against the report date.
    const check = await this.windows.checkSubmission(input.stadiumId, now);
    if (!check.open) {
      throw AppException.badRequest(check.code, check.message, {
        opensAt: check.bounds?.opensAt ?? null,
        closesAt: check.bounds?.closesAt ?? null,
      });
    }

    const totals = eodWorkforceTotals(input.workforce);
    const activity = await this.countActivity(input.stadiumId, actor.id, input.date);
    const id = existing?.id ?? input.id;
    const serverReceivedAt = new Date();

    await this.prisma.$transaction(async (tx) => {
      const data = {
        stadiumId: input.stadiumId,
        tournamentId: context.tournamentId,
        inspectorId: actor.id,
        date: toDateColumn(input.date),
        status: 'SUBMITTED' as const,
        totalHeadcount: totals.totalHeadcount,
        totalManHours: new Prisma.Decimal(totals.totalManHours),
        // Derived from what actually happened, not from what the device claims.
        inspectionsCompleted: activity.inspections,
        observationsRaised: activity.observations,
        findingsRaised: activity.findingsRaised,
        findingsClosed: activity.findingsClosed,
        ...formFields(input),
        summary: input.summary,
        clientCreatedAt: input.clientCreatedAt,
        submittedAt: input.submittedAt,
        serverReceivedAt,
        latitude: input.gps?.latitude ?? null,
        longitude: input.gps?.longitude ?? null,
        gpsAccuracyM: input.gps?.accuracyM ?? null,
        deviceId: input.deviceId ?? null,
        appVersion: input.appVersion ?? null,
        isLocked: true,
      };

      await tx.eodReport.upsert({
        where: { id },
        create: { id, ...data },
        update: data,
      });

      await writeWorkforce(tx, id, input.workforce);

      await this.audit.record(
        {
          actor,
          action: 'SUBMIT',
          entity: 'eod_reports',
          entityId: id,
          stadiumId: input.stadiumId,
          diff: {
            date: { from: null, to: input.date },
            totalManHours: { from: null, to: totals.totalManHours },
            totalHeadcount: { from: null, to: totals.totalHeadcount },
          },
        },
        tx,
      );
    });

    if (input.evidenceIds.length > 0) {
      await this.evidence.attach(input.evidenceIds, 'EOD', id, actor);
    }

    return this.get(id, actor);
  }

  async correct(id: string, input: CorrectEodInput, actor: RequestUser): Promise<EodReportDto> {
    const existing = await this.prisma.eodReport.findFirst({
      where: { id, ...INCLUDING_DELETED },
      include: { workforce: true },
    });
    if (!existing) throw AppException.notFound('EOD report', id);
    if (existing.deletedAt) throw AppException.deleted('This EOD report');

    const totals = input.workforce
      ? eodWorkforceTotals(input.workforce)
      : {
          totalHeadcount: existing.totalHeadcount,
          totalManHours: existing.totalManHours.toFixed(2),
        };

    // workRelatedMedical wins; a legacy recordableIncidents alone still maps onto it.
    const medical =
      input.workRelatedMedical !== undefined || input.recordableIncidents !== undefined
        ? resolveEodIncidentStats(input)
        : null;

    const changes = {
      totalHeadcount: totals.totalHeadcount,
      totalManHours: new Prisma.Decimal(totals.totalManHours),
      totalSpectators: input.totalSpectators,
      workRelatedMedical: medical?.workRelatedMedical,
      recordableIncidents: medical?.recordableIncidents,
      nonWorkRelatedMedical: input.nonWorkRelatedMedical,
      firstAidCases: input.firstAidCases,
      fireIncidents: input.fireIncidents,
      otherIncidents: input.otherIncidents,
      hseObservationsReported: input.hseObservationsReported,
      nearMisses: input.nearMisses,
      summary: input.summary ?? undefined,
      concerns: input.concerns ?? undefined,
      actionsMitigation: input.actionsMitigation ?? undefined,
      plannedTomorrow: input.plannedTomorrow ?? undefined,
      additionalRemarks: input.additionalRemarks ?? undefined,
      weather: input.weather ?? undefined,
    };

    const diff = buildDiff(
      {
        totalHeadcount: existing.totalHeadcount,
        totalManHours: existing.totalManHours,
        totalSpectators: existing.totalSpectators,
        workRelatedMedical: existing.workRelatedMedical,
        recordableIncidents: existing.recordableIncidents,
        nonWorkRelatedMedical: existing.nonWorkRelatedMedical,
        firstAidCases: existing.firstAidCases,
        fireIncidents: existing.fireIncidents,
        otherIncidents: existing.otherIncidents,
        hseObservationsReported: existing.hseObservationsReported,
        nearMisses: existing.nearMisses,
        summary: existing.summary,
        concerns: existing.concerns,
        actionsMitigation: existing.actionsMitigation,
        plannedTomorrow: existing.plannedTomorrow,
        additionalRemarks: existing.additionalRemarks,
        weather: existing.weather,
      },
      changes as never,
    );

    await this.prisma.$transaction(async (tx) => {
      await tx.eodReport.update({ where: { id }, data: changes });

      if (input.workforce) await writeWorkforce(tx, id, input.workforce);

      await this.audit.record(
        {
          actor,
          action: 'ADMIN_CORRECTION',
          entity: 'eod_reports',
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
   * Admin soft delete. The report disappears from every read (see
   * soft-delete.ts) and frees its (stadium, inspector, date) slot, so the
   * inspector can submit again. Drafts belong to the device and are refused.
   */
  async softDelete(id: string, reason: string, actor: RequestUser): Promise<void> {
    const existing = await this.prisma.eodReport.findFirst({
      where: { id, ...INCLUDING_DELETED },
      select: { id: true, stadiumId: true, status: true, deletedAt: true },
    });
    if (!existing) throw AppException.notFound('EOD report', id);
    if (existing.deletedAt) throw AppException.conflict('This EOD report is already deleted');
    if (existing.status !== 'SUBMITTED') {
      throw AppException.conflict('Only a submitted EOD report can be deleted');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.eodReport.update({
        where: { id },
        data: { ...softDeleteData(actor.id, reason), deletedSlot: id },
      });
      await this.audit.record(
        { actor, action: 'DELETE', entity: 'eod_reports', entityId: id, stadiumId: existing.stadiumId, reason },
        tx,
      );
    });
  }

  /** Brings a soft-deleted report back, unless a new one has taken its slot since. */
  async restore(id: string, reason: string, actor: RequestUser): Promise<EodReportDto> {
    const existing = await this.prisma.eodReport.findFirst({
      where: { id, ...ONLY_DELETED },
      select: { id: true, stadiumId: true, inspectorId: true, date: true },
    });
    if (!existing) {
      const live = await this.prisma.eodReport.count({ where: { id } });
      if (live > 0) throw AppException.conflict('This EOD report is not deleted');
      throw AppException.notFound('EOD report', id);
    }
    const taken = await this.prisma.eodReport.count({
      where: {
        stadiumId: existing.stadiumId,
        inspectorId: existing.inspectorId,
        date: existing.date,
        id: { not: id },
      },
    });
    if (taken > 0) {
      throw AppException.conflict(
        'Another EOD report now exists for this inspector, stadium and date; delete it first',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.eodReport.update({
        where: { id },
        data: { ...RESTORE_DATA, deletedSlot: LIVE_SLOT },
      });
      await touchRestoredChildren(tx, { eodIds: [id] });
      await this.audit.record(
        { actor, action: 'RESTORE', entity: 'eod_reports', entityId: id, stadiumId: existing.stadiumId, reason },
        tx,
      );
    });
    return this.get(id, actor);
  }

  /**
   * A device may push a report an admin has since soft-deleted (an old draft
   * or a retry). It must not resurrect it through the upsert.
   */
  private async assertNotDeleted(id: string): Promise<void> {
    const deleted = await this.prisma.eodReport.count({ where: { id, ...ONLY_DELETED } });
    if (deleted > 0) throw AppException.deleted('This EOD report');
  }

  /**
   * Who owes an EOD for a date: every assigned inspector at every stadium, with
   * whether they submitted. This is the reviewer's chase-up list; a supervisor
   * only sees their own stadiums. Only inspectors owe an EOD.
   */
  async complianceFor(
    date: string,
    stadiumId: string | undefined,
    actor: RequestUser,
  ): Promise<EodComplianceRow[]> {
    if (stadiumId && !canAccessStadium(actor, stadiumId)) throw AppException.outOfScope();
    const stadiums = await this.prisma.stadium.findMany({
      where: {
        deletedAt: null,
        isActive: true,
        ...stadiumScopeWhere(actor, 'id'),
        ...(stadiumId ? { id: stadiumId } : {}),
      },
      select: {
        id: true,
        name: true,
        assignments: {
          where: { user: { role: 'INSPECTOR' } },
          select: { user: { select: { id: true, fullName: true, status: true, deletedAt: true } } },
        },
      },
      orderBy: { name: 'asc' },
    });

    const submitted = await this.prisma.eodReport.findMany({
      where: {
        date: toDateColumn(date),
        status: 'SUBMITTED',
        ...stadiumScopeWhere(actor),
        ...(stadiumId ? { stadiumId } : {}),
      },
      select: { stadiumId: true, inspectorId: true, submittedAt: true },
    });

    const key = (stadium: string, inspector: string) => `${stadium}:${inspector}`;
    const submittedMap = new Map(
      submitted.map((row) => [key(row.stadiumId, row.inspectorId), row.submittedAt]),
    );

    const rows: EodComplianceRow[] = [];
    for (const stadium of stadiums) {
      for (const assignment of stadium.assignments) {
        const user = assignment.user;
        if (user.deletedAt || user.status !== 'ACTIVE') continue;
        const submittedAt = submittedMap.get(key(stadium.id, user.id)) ?? null;
        rows.push({
          stadiumId: stadium.id,
          stadiumName: stadium.name,
          inspectorId: user.id,
          inspectorName: user.fullName,
          date,
          submitted: submittedAt !== null,
          submittedAt,
        });
      }
    }
    return rows;
  }

  /** The day's real activity, read back from the records themselves. */
  private async countActivity(
    stadiumId: string,
    inspectorId: string,
    date: string,
  ): Promise<{
    inspections: number;
    observations: number;
    findingsRaised: number;
    findingsClosed: number;
  }> {
    const localDate = toDateColumn(date);
    const [inspections, observations, findingsRaised, findingsClosed] = await Promise.all([
      this.prisma.inspection.count({
        where: { stadiumId, inspectorId, localDate, status: 'SUBMITTED' },
      }),
      this.prisma.observation.count({
        where: { stadiumId, inspectorId, localDate, status: 'SUBMITTED' },
      }),
      this.prisma.finding.count({ where: { stadiumId, raisedById: inspectorId, localDate } }),
      this.prisma.finding.count({
        where: {
          stadiumId,
          status: 'CLOSED',
          closedAt: {
            gte: new Date(localDate),
            lt: new Date(localDate.getTime() + 86_400_000),
          },
        },
      }),
    ]);
    return { inspections, observations, findingsRaised, findingsClosed };
  }

  private async loadContext(stadiumId: string): Promise<{
    timezone: string;
    tournamentId: string | null;
  }> {
    const stadium = await this.prisma.stadium.findFirst({
      where: { id: stadiumId, deletedAt: null },
      select: { timezone: true },
    });
    if (!stadium) throw AppException.notFound('Stadium', stadiumId);

    const tournament = await this.prisma.tournament.findFirst({
      where: { isActive: true },
      select: { id: true },
    });
    return { timezone: stadium.timezone, tournamentId: tournament?.id ?? null };
  }
}

/**
 * Replaces a report's workforce rows. man-hours are recomputed here as
 * personnel x hours in fixed point; whatever the device sent is ignored.
 */
async function writeWorkforce(
  tx: Prisma.TransactionClient,
  eodReportId: string,
  entries: EodWorkforceEntryInput[],
): Promise<void> {
  await tx.eodWorkforceEntry.deleteMany({ where: { eodReportId } });
  if (entries.length === 0) return;
  await tx.eodWorkforceEntry.createMany({
    data: entries.map((entry, index) => ({
      id: uuidv7(),
      eodReportId,
      category: entry.category,
      personnel: entry.personnel,
      hours: new Prisma.Decimal(toDecimalString(entry.hours)),
      manHours: new Prisma.Decimal(workforceManHours(entry)),
      sortOrder: index,
    })),
  });
}

/** The form fields shared by draft save and submit. */
function formFields(input: SaveEodDraftInput | SubmitEodInput) {
  const medical = resolveEodIncidentStats(input);
  return {
    totalSpectators: input.totalSpectators ?? null,
    workRelatedMedical: medical.workRelatedMedical,
    // Not on the form any more; mirrors workRelatedMedical so KPIs keep working.
    recordableIncidents: medical.recordableIncidents,
    nonWorkRelatedMedical: input.nonWorkRelatedMedical,
    firstAidCases: input.firstAidCases,
    fireIncidents: input.fireIncidents,
    otherIncidents: input.otherIncidents,
    hseObservationsReported: input.hseObservationsReported,
    nearMisses: input.nearMisses,
    summary: input.summary ?? null,
    concerns: input.concerns ?? null,
    actionsMitigation: input.actionsMitigation ?? null,
    plannedTomorrow: input.plannedTomorrow ?? null,
    additionalRemarks: input.additionalRemarks ?? null,
    weather: input.weather ?? null,
  };
}

function toDto(row: EodRow): EodReportDto {
  return {
    id: row.id,
    stadiumId: row.stadiumId,
    stadiumName: row.stadium.name,
    tournamentId: row.tournamentId,
    inspectorId: row.inspectorId,
    inspectorName: row.inspector.fullName,
    date: fromDateColumn(row.date),
    status: row.status,
    totalHeadcount: row.totalHeadcount,
    totalManHours: toDecimalString(row.totalManHours.toFixed(2)),
    workforce: row.workforce.map((entry) => ({
      category: entry.category,
      personnel: entry.personnel,
      hours: toDecimalString(entry.hours.toFixed(2)),
      manHours: toDecimalString(entry.manHours.toFixed(2)),
    })),
    totalSpectators: row.totalSpectators,
    workRelatedMedical: row.workRelatedMedical,
    nonWorkRelatedMedical: row.nonWorkRelatedMedical,
    firstAidCases: row.firstAidCases,
    fireIncidents: row.fireIncidents,
    otherIncidents: row.otherIncidents,
    hseObservationsReported: row.hseObservationsReported,
    inspectionsCompleted: row.inspectionsCompleted,
    observationsRaised: row.observationsRaised,
    findingsRaised: row.findingsRaised,
    findingsClosed: row.findingsClosed,
    recordableIncidents: row.recordableIncidents,
    nearMisses: row.nearMisses,
    summary: row.summary,
    concerns: row.concerns,
    actionsMitigation: row.actionsMitigation,
    plannedTomorrow: row.plannedTomorrow,
    additionalRemarks: row.additionalRemarks,
    weather: row.weather,
    clientCreatedAt: row.clientCreatedAt,
    submittedAt: row.submittedAt,
    serverReceivedAt: row.serverReceivedAt,
    gps:
      row.latitude !== null && row.longitude !== null
        ? { latitude: row.latitude, longitude: row.longitude, accuracyM: row.gpsAccuracyM }
        : null,
    isLocked: row.isLocked,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    ...softDeleteDto(row),
  };
}

function dateRange(from?: string, to?: string): Prisma.DateTimeFilter | undefined {
  if (!from && !to) return undefined;
  return {
    ...(from ? { gte: toDateColumn(from) } : {}),
    ...(to ? { lte: toDateColumn(to) } : {}),
  };
}
