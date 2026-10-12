import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Prisma, type ReportType } from '@prisma/client';
import type { Queue } from 'bullmq';
import {
  isoWeekRange,
  uuidv7,
  type ListReportsQuery,
  type Paginated,
  type Report as ReportDto,
  type ReportPeriod,
  type RequestReportInput,
} from '@ahlan/shared';

import { PrismaService } from '../../prisma/prisma.service';
import { StorageService } from '../../storage/storage.service';
import { AppException } from '../../common/errors/app.exception';
import { cursorArgs, paginateById } from '../../common/util/cursor';
import { fromDateColumn, toDateColumn } from '../../common/util/local-date';
import { canAccessStadium, type RequestUser } from '../../common/types/request-user';
import { AuditService } from '../audit/audit.service';
import { JOBS, QUEUES } from '../../queues/queue-names';
import { enqueue } from '../../queues/enqueue';

const reportInclude = {
  stadium: { select: { name: true, code: true } },
} satisfies Prisma.ReportInclude;

type ReportRow = Prisma.ReportGetPayload<{ include: typeof reportInclude }>;

/**
 * Report requests.
 *
 * An HTTP request only ever writes a QUEUED row and pushes a job: generating a
 * tournament PDF takes tens of seconds and must never hold a connection open.
 * The worker fills in the result and the app polls or waits for the push.
 */
@Injectable()
export class ReportsService {
  private readonly logger = new Logger(ReportsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
    @InjectQueue(QUEUES.reports) private readonly queue: Queue,
  ) {}

  async list(query: ListReportsQuery, actor: RequestUser): Promise<Paginated<ReportDto>> {
    if (query.stadiumId && !canAccessStadium(actor, query.stadiumId)) {
      throw AppException.outOfScope();
    }
    const rows = await this.prisma.report.findMany({
      where: {
        type: query.type,
        scope: query.scope,
        stadiumId: query.stadiumId,
        status: query.status,
        tournamentId: query.tournamentId,
        ...reportScopeWhere(actor),
      },
      include: reportInclude,
      orderBy: { id: 'desc' },
      take: query.limit + 1,
      ...cursorArgs(query.cursor),
    });

    const page = paginateById(rows, query.limit);
    return { ...page, items: page.items.map((row) => toDto(row, null)) };
  }

  async get(id: string, actor: RequestUser): Promise<ReportDto> {
    const row = await this.prisma.report.findUnique({ where: { id }, include: reportInclude });
    if (!row) throw AppException.notFound('Report', id);
    this.assertCanRead(row, actor);

    // Presigned on read, not stored: a link in the database would outlive its
    // signature and start 403-ing.
    const downloadUrl =
      row.status === 'COMPLETED' && row.objectKey
        ? await this.storage
            .presignDownload(row.objectKey, this.storage.reportsBucket)
            .catch(() => null)
        : null;

    return toDto(row, downloadUrl);
  }

  /** Resolves the reporting period from the report type. */
  async resolvePeriod(input: RequestReportInput): Promise<ReportPeriod & { tournamentId: string }> {
    const tournament = input.tournamentId
      ? await this.prisma.tournament.findFirst({ where: { id: input.tournamentId, deletedAt: null } })
      : await this.prisma.tournament.findFirst({ where: { isActive: true } });
    if (!tournament) {
      throw AppException.validation('No active tournament; create one before running reports');
    }

    const tournamentStart = fromDateColumn(tournament.startDate);
    const tournamentEnd = fromDateColumn(tournament.endDate);
    const asOf = input.asOfDate ?? todayWithin(tournamentStart, tournamentEnd);

    switch (input.type satisfies ReportType) {
      case 'WEEKLY': {
        // Monday to Sunday of the week containing asOf, clipped to the tournament.
        const week = isoWeekRange(asOf);
        return {
          type: 'WEEKLY',
          periodStart: laterOf(week.start, tournamentStart),
          periodEnd: earlierOf(week.end, tournamentEnd),
          label: `Week of ${week.start}`,
          tournamentId: tournament.id,
        };
      }
      case 'CUMULATIVE':
        return {
          type: 'CUMULATIVE',
          periodStart: tournamentStart,
          periodEnd: earlierOf(asOf, tournamentEnd),
          label: `Tournament to date (${tournamentStart} to ${earlierOf(asOf, tournamentEnd)})`,
          tournamentId: tournament.id,
        };
      case 'END_OF_TOURNAMENT':
      default:
        return {
          type: 'END_OF_TOURNAMENT',
          periodStart: tournamentStart,
          periodEnd: tournamentEnd,
          label: `End of tournament: ${tournament.name}`,
          tournamentId: tournament.id,
        };
    }
  }

  /** Writes the QUEUED row and pushes the job. */
  async request(input: RequestReportInput, actor: RequestUser): Promise<ReportDto> {
    this.assertCanRequest(input.scope, input.stadiumId ?? null, actor);
    if (input.scope === 'STADIUM' && input.stadiumId) {
      const stadium = await this.prisma.stadium.findFirst({
        where: { id: input.stadiumId, deletedAt: null },
        select: { id: true },
      });
      if (!stadium) throw AppException.notFound('Stadium', input.stadiumId);
    }

    const period = await this.resolvePeriod(input);
    const id = uuidv7();

    await this.prisma.report.create({
      data: {
        id,
        type: input.type,
        scope: input.scope,
        stadiumId: input.scope === 'STADIUM' ? (input.stadiumId ?? null) : null,
        tournamentId: period.tournamentId,
        periodStart: toDateColumn(period.periodStart),
        periodEnd: toDateColumn(period.periodEnd),
        status: 'QUEUED',
        includeAiInsights: input.includeAiInsights,
        locale: input.locale,
        note: input.note ?? null,
        requestedById: actor.id,
      },
    });

    await this.audit.record({
      actor,
      action: 'CREATE',
      entity: 'reports',
      entityId: id,
      stadiumId: input.stadiumId ?? null,
      reason: `${input.type} report requested`,
    });

    try {
      await enqueue(this.queue, JOBS.generateReport, { reportId: id }, { jobId: `report:${id}` });
    } catch (error) {
      // Leave the row QUEUED and say so plainly rather than pretending it worked.
      await this.prisma.report.update({
        where: { id },
        data: { status: 'FAILED', error: 'Could not reach the job queue' },
      });
      this.logger.error(`Could not enqueue report ${id}: ${(error as Error).message}`);
      throw AppException.internal('The report queue is unavailable. Please try again.');
    }

    return this.get(id, actor);
  }

  /** Re-runs a failed report in place, keeping its id and audit history. */
  async retry(id: string, actor: RequestUser): Promise<ReportDto> {
    const report = await this.prisma.report.findUnique({ where: { id } });
    if (!report) throw AppException.notFound('Report', id);
    this.assertCanRequest(report.scope, report.stadiumId, actor);
    if (report.status === 'RUNNING') {
      throw AppException.conflict('This report is already being generated');
    }

    await this.prisma.report.update({
      where: { id },
      data: { status: 'QUEUED', error: null, startedAt: null, completedAt: null },
    });
    await enqueue(
      this.queue,
      JOBS.generateReport,
      { reportId: id },
      { jobId: `report:${id}:${Date.now()}` },
    );

    return this.get(id, actor);
  }

  /* --------------------------- permissions --------------------------- */

  /**
   * Admins may request anything. A supervisor may only request (or retry) a
   * STADIUM report for one of their own stadiums; consolidated reports span
   * stadiums they cannot see.
   */
  assertCanRequest(scope: string, stadiumId: string | null, actor: RequestUser): void {
    if (actor.role === 'ADMIN') return;
    if (actor.role !== 'SUPERVISOR') {
      throw AppException.forbidden('This action requires role: ADMIN or SUPERVISOR');
    }
    if (scope !== 'STADIUM' || !stadiumId) {
      throw AppException.forbidden('Supervisors can only request reports for a single stadium');
    }
    if (!canAccessStadium(actor, stadiumId)) throw AppException.outOfScope();
  }

  private assertCanRead(row: { stadiumId: string | null }, actor: RequestUser): void {
    if (actor.role === 'SUPERVISOR' && !row.stadiumId) {
      throw AppException.forbidden('Consolidated reports are for administrators');
    }
    if (row.stadiumId && !canAccessStadium(actor, row.stadiumId)) {
      throw AppException.outOfScope();
    }
  }

  /**
   * Admin delete: the row and its PDF go. Reports are generated artefacts, not
   * HSE records, so this is a hard delete (audited). A report that is being
   * rendered right now is refused; a queued one is dropped by the worker when
   * it finds the row gone.
   */
  async remove(id: string, actor: RequestUser, reason?: string): Promise<void> {
    const row = await this.prisma.report.findUnique({ where: { id } });
    if (!row) throw AppException.notFound('Report', id);
    if (row.status === 'RUNNING') {
      throw AppException.conflict('This report is being generated; delete it once it has finished');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.report.delete({ where: { id } });
      await this.audit.record(
        {
          actor,
          action: 'DELETE',
          entity: 'reports',
          entityId: id,
          stadiumId: row.stadiumId,
          reason: reason ?? null,
          diff: { objectKey: { from: row.objectKey, to: null } },
        },
        tx,
      );
    });

    if (row.objectKey) {
      await this.storage
        .deleteObject(row.objectKey, this.storage.reportsBucket)
        .catch((error: Error) =>
          this.logger.warn(`Could not delete report object ${row.objectKey}: ${error.message}`),
        );
    }
  }

  /* ------------------- called by the worker ------------------- */

  async markRunning(id: string): Promise<void> {
    await this.prisma.report.update({
      where: { id },
      data: { status: 'RUNNING', startedAt: new Date(), error: null },
    });
  }

  async markCompleted(
    id: string,
    result: { objectKey: string; fileName: string; sizeBytes: number; pageCount: number | null },
  ): Promise<void> {
    await this.prisma.report.update({
      where: { id },
      data: {
        status: 'COMPLETED',
        completedAt: new Date(),
        objectKey: result.objectKey,
        fileName: result.fileName,
        sizeBytes: result.sizeBytes,
        pageCount: result.pageCount,
        error: null,
      },
    });
  }

  async markFailed(id: string, message: string): Promise<void> {
    await this.prisma.report.update({
      where: { id },
      data: {
        status: 'FAILED',
        completedAt: new Date(),
        // Truncated: a stack trace must not end up in an API response.
        error: message.slice(0, 500),
      },
    });
  }
}

/**
 * Which reports a caller may list: admins all; supervisors their stadiums'
 * reports only; inspectors their stadiums' plus consolidated ones.
 */
function reportScopeWhere(actor: RequestUser): Prisma.ReportWhereInput {
  if (actor.role === 'ADMIN') return {};
  if (actor.role === 'SUPERVISOR') return { AND: [{ stadiumId: { in: actor.stadiumIds } }] };
  return { OR: [{ stadiumId: { in: actor.stadiumIds } }, { stadiumId: null }] };
}

function toDto(row: ReportRow, downloadUrl: string | null): ReportDto {
  return {
    id: row.id,
    type: row.type,
    scope: row.scope,
    stadiumId: row.stadiumId,
    stadiumName: row.stadium?.name ?? null,
    tournamentId: row.tournamentId,
    periodStart: fromDateColumn(row.periodStart),
    periodEnd: fromDateColumn(row.periodEnd),
    status: row.status,
    objectKey: row.objectKey,
    fileName: row.fileName,
    sizeBytes: row.sizeBytes,
    pageCount: row.pageCount,
    downloadUrl,
    includeAiInsights: row.includeAiInsights,
    requestedById: row.requestedById,
    error: row.error,
    startedAt: row.startedAt,
    completedAt: row.completedAt,
    createdAt: row.createdAt,
  };
}

function todayWithin(start: string, end: string): string {
  const today = new Date().toISOString().slice(0, 10);
  if (today < start) return start;
  if (today > end) return end;
  return today;
}

function laterOf(a: string, b: string): string {
  return a > b ? a : b;
}

function earlierOf(a: string, b: string): string {
  return a < b ? a : b;
}
