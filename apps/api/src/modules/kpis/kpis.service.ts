import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  addDecimals,
  addDays,
  closureRate,
  complianceBand,
  compliancePercent,
  coveragePercent,
  daysBetween,
  deltaPoints,
  eachDay,
  emptySeverityCounts,
  incidentRate,
  OBSERVATION_TYPES,
  readinessChecklistsFor,
  riskIndex,
  roundTo,
  SEVERITIES,
  stadiumChecklistProgress,
  zonedDateString,
  DEFAULT_TIME_ZONE,
  type Dashboard,
  type DisciplineDashboard,
  type DisciplineDashboardQuery,
  type StadiumCardKpi,
  type StadiumCardsQuery,
  type DisciplineKpi,
  type InspectorHome,
  type InspectorKpi,
  type KpiQuery,
  type KpiSummary,
  type ResponseTally,
  type SeverityCounts,
  type StadiumKpi,
  type TrendPoint,
} from '@ahlan/shared';

import { PrismaService } from '../../prisma/prisma.service';
import { AppException } from '../../common/errors/app.exception';
import { fromDateColumn, toDateColumn } from '../../common/util/local-date';
import {
  isStadiumScoped,
  stadiumScopeWhere,
  type RequestUser,
} from '../../common/types/request-user';
import { EodWindowsService } from '../eod/eod-windows.service';
import { StorageService } from '../../storage/storage.service';

interface Window {
  from: string;
  to: string;
  stadiumIds: string[] | null;
  tournamentId: string | null;
  disciplineId?: string;
}

/**
 * Every figure the dashboards and PDFs show.
 *
 * All of it is recomputed from rows with the formulas in `@ahlan/shared`, so the
 * number on an inspector's phone, on the admin dashboard and in the PDF is
 * always the same number.
 */
@Injectable()
export class KpisService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly windows: EodWindowsService,
    private readonly storage: StorageService,
  ) {}

  /* ------------------------------ dashboard ----------------------------- */

  async dashboard(query: KpiQuery, actor: RequestUser): Promise<Dashboard> {
    const window = await this.resolveWindow(query, actor);
    const summary = await this.summary(window, query.compare);

    const [trend, byStadium, byDiscipline, topRepeatFindings] = await Promise.all([
      this.trend(window),
      this.byStadium(window),
      this.byDiscipline(window),
      this.topRepeatFindings(window),
    ]);

    return { summary, trend, byStadium, byDiscipline, topRepeatFindings };
  }

  /**
   * The headline figures for a window. `compare` adds the delta against the
   * immediately preceding window of the same length.
   */
  async summary(window: Window, compare = false): Promise<KpiSummary> {
    const base = await this.computeSummary(window);

    if (!compare) return base;

    const length = daysBetween(window.from, window.to) + 1;
    const previous = await this.computeSummary({
      ...window,
      from: addDays(window.from, -length),
      to: addDays(window.from, -1),
    });

    return {
      ...base,
      complianceDelta: deltaPoints(base.compliancePercent, previous.compliancePercent),
    };
  }

  private async computeSummary(window: Window): Promise<KpiSummary> {
    const where = this.inspectionWhere(window);

    const [tally, inspections, observations, findings, eod, severities] = await Promise.all([
      this.tallyFor(window),
      this.prisma.inspection.count({ where }),
      this.prisma.observation.count({ where: this.observationWhere(window) }),
      this.findingRollup(window),
      this.eodTotals(window),
      this.severityCounts(window),
    ]);

    const compliance = compliancePercent(tally);
    const inspectedItems = tally.yes + tally.no + tally.na;
    const expectedEod = await this.expectedEodCount(window);

    return {
      periodStart: window.from,
      periodEnd: window.to,
      inspections,
      observations,
      eodSubmitted: eod.submitted,
      eodExpected: expectedEod,
      yesCount: tally.yes,
      noCount: tally.no,
      naCount: tally.na,
      compliancePercent: compliance,
      complianceBand: complianceBand(compliance),
      complianceDelta: null,
      riskIndex: riskIndex(severities, inspectedItems),
      findingsTotal: findings.total,
      findingsOpen: findings.open,
      findingsClosed: findings.closed,
      findingsOverdue: findings.overdue,
      closureRate: closureRate(findings),
      averageDaysToClose: findings.averageDaysToClose,
      totalHeadcount: eod.headcount,
      totalManHours: eod.manHours,
      recordableIncidents: eod.recordableIncidents,
      nearMisses: eod.nearMisses,
      incidentRate: incidentRate(eod.recordableIncidents, eod.manHours),
      severity: severities,
      generatedAt: new Date(),
    };
  }

  /* ----------------------------- breakdowns ---------------------------- */

  /** Per-stadium league table, worst compliance first. */
  async byStadium(window: Window): Promise<StadiumKpi[]> {
    const stadiums = await this.prisma.stadium.findMany({
      where: {
        deletedAt: null,
        ...(window.stadiumIds ? { id: { in: window.stadiumIds } } : {}),
      },
      select: { id: true, name: true, code: true },
      orderBy: { name: 'asc' },
    });

    const rows = await Promise.all(
      stadiums.map(async (stadium) => {
        const scoped: Window = { ...window, stadiumIds: [stadium.id] };
        const summary = await this.computeSummary(scoped);
        return {
          ...summary,
          stadiumId: stadium.id,
          stadiumName: stadium.name,
          stadiumCode: stadium.code,
        };
      }),
    );

    // Stadiums with no score sink to the bottom rather than reading as 0%.
    return rows.sort((a, b) => {
      if (a.compliancePercent === null) return 1;
      if (b.compliancePercent === null) return -1;
      return a.compliancePercent - b.compliancePercent;
    });
  }

  async byDiscipline(window: Window): Promise<DisciplineKpi[]> {
    const disciplines = await this.prisma.discipline.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
      orderBy: { sortOrder: 'asc' },
    });

    return Promise.all(
      disciplines.map(async (discipline) => {
        const scoped: Window = { ...window, disciplineId: discipline.id };

        const [observations, grouped, findings, tally] = await Promise.all([
          this.prisma.observation.count({
            where: { ...this.observationWhere(window), disciplineId: discipline.id },
          }),
          this.prisma.observation.groupBy({
            by: ['type'],
            where: { ...this.observationWhere(window), disciplineId: discipline.id },
            _count: { _all: true },
          }),
          this.prisma.finding.count({
            where: { ...this.findingWhere(window), disciplineId: discipline.id },
          }),
          this.tallyFor(scoped),
        ]);

        const severities = await this.severityCounts(scoped);

        const byType = {
          UNSAFE_ACT: 0,
          UNSAFE_CONDITION: 0,
          POSITIVE: 0,
          NEAR_MISS: 0,
        };
        for (const group of grouped) byType[group.type] = group._count._all;

        return {
          disciplineId: discipline.id,
          disciplineName: discipline.name,
          observations,
          findings,
          compliancePercent: compliancePercent(tally),
          severity: severities,
          byType,
        };
      }),
    );
  }

  /** Per-inspector activity, including their EOD discipline. */
  async byInspector(window: Window): Promise<InspectorKpi[]> {
    const inspectors = await this.prisma.user.findMany({
      where: {
        deletedAt: null,
        role: 'INSPECTOR',
        ...(window.stadiumIds
          ? { stadiums: { some: { stadiumId: { in: window.stadiumIds } } } }
          : {}),
      },
      select: {
        id: true,
        fullName: true,
        stadiums: { select: { stadiumId: true } },
      },
      orderBy: { fullName: 'asc' },
    });

    const days = daysBetween(window.from, window.to) + 1;

    return Promise.all(
      inspectors.map(async (inspector) => {
        const stadiumIds = window.stadiumIds
          ? inspector.stadiums
              .map((row) => row.stadiumId)
              .filter((id) => window.stadiumIds?.includes(id))
          : inspector.stadiums.map((row) => row.stadiumId);

        const scoped: Window = { ...window, stadiumIds };
        const [inspections, observations, eodSubmitted, tally] = await Promise.all([
          this.prisma.inspection.count({
            where: { ...this.inspectionWhere(scoped), inspectorId: inspector.id },
          }),
          this.prisma.observation.count({
            where: { ...this.observationWhere(scoped), inspectorId: inspector.id },
          }),
          this.prisma.eodReport.count({
            where: {
              inspectorId: inspector.id,
              status: 'SUBMITTED',
              date: { gte: toDateColumn(window.from), lte: toDateColumn(window.to) },
              ...(stadiumIds.length > 0 ? { stadiumId: { in: stadiumIds } } : {}),
            },
          }),
          this.tallyFor({ ...scoped }, inspector.id),
        ]);

        // One EOD per assigned stadium per day is what we expect of them.
        const expected = days * Math.max(1, stadiumIds.length);

        return {
          inspectorId: inspector.id,
          inspectorName: inspector.fullName,
          inspections,
          observations,
          eodSubmitted,
          eodExpected: expected,
          eodCompliance: coveragePercent(eodSubmitted, expected),
          compliancePercent: compliancePercent(tally),
        };
      }),
    );
  }

  /** Daily series for the compliance chart. */
  async trend(window: Window): Promise<TrendPoint[]> {
    const days = eachDay(window.from, window.to);
    // Keeps the chart query bounded on a long cumulative window.
    const sampled = days.length <= 90 ? days : days.filter((_, index) => index % 7 === 0);

    return Promise.all(
      sampled.map(async (date) => {
        const scoped: Window = { ...window, from: date, to: date };
        const [tally, inspections, raised, closed] = await Promise.all([
          this.tallyFor(scoped),
          this.prisma.inspection.count({ where: this.inspectionWhere(scoped) }),
          this.prisma.finding.count({ where: this.findingWhere(scoped) }),
          this.prisma.finding.count({
            where: {
              ...(window.stadiumIds ? { stadiumId: { in: window.stadiumIds } } : {}),
              status: 'CLOSED',
              closedAt: {
                gte: toDateColumn(date),
                lt: toDateColumn(addDays(date, 1)),
              },
            },
          }),
        ]);

        return {
          date,
          compliancePercent: compliancePercent(tally),
          inspections,
          findingsRaised: raised,
          findingsClosed: closed,
        };
      }),
    );
  }

  /** Checklist items that failed most often - the "fix this first" list. */
  async topRepeatFindings(window: Window, limit = 10) {
    const grouped = await this.prisma.inspectionResponse.groupBy({
      by: ['itemCode'],
      where: {
        value: 'NO',
        inspection: this.inspectionWhere(window),
      },
      _count: { _all: true },
      orderBy: { _count: { itemCode: 'desc' } },
      take: limit,
    });

    return Promise.all(
      grouped.map(async (group) => {
        const sample = await this.prisma.inspectionResponse.findFirst({
          where: { itemCode: group.itemCode, value: 'NO', inspection: this.inspectionWhere(window) },
          select: {
            severity: true,
            item: { select: { question: true, defaultSeverity: true } },
          },
        });
        return {
          itemCode: group.itemCode,
          question: sample?.item.question ?? group.itemCode,
          noCount: group._count._all,
          severity: sample?.severity ?? sample?.item.defaultSeverity ?? 'MEDIUM',
        };
      }),
    );
  }

  /* ---------------------------- stadium cards --------------------------- */

  /**
   * One card per stadium in scope: readiness checklists done / expected on the
   * date (stadium-local), open findings, tournament-to-date compliance and the
   * assigned inspectors. Rules in `stadiumChecklistProgress` (@ahlan/shared).
   */
  async stadiumCards(
    query: StadiumCardsQuery,
    actor: RequestUser,
    now = new Date(),
  ): Promise<StadiumCardKpi[]> {
    const stadiums = await this.prisma.stadium.findMany({
      where: {
        deletedAt: null,
        // An admin sees every stadium, inactive ones included (the app badges
        // them); everyone else only their active, assigned stadiums.
        isActive: isStadiumScoped(actor) ? true : undefined,
        ...stadiumScopeWhere(actor, 'id'),
      },
      select: {
        id: true,
        code: true,
        name: true,
        nameAr: true,
        city: true,
        timezone: true,
        isActive: true,
        imageKey: true,
        assignments: {
          where: { user: { role: 'INSPECTOR', status: 'ACTIVE', deletedAt: null } },
          select: { user: { select: { id: true, fullName: true } } },
          orderBy: { user: { fullName: 'asc' } },
        },
      },
      orderBy: { name: 'asc' },
    });
    if (stadiums.length === 0) return [];

    const dates = new Map(
      stadiums.map((stadium) => [stadium.id, query.date ?? zonedDateString(now, stadium.timezone)]),
    );
    const stadiumIds = stadiums.map((stadium) => stadium.id);

    const [checklists, submitted, openFindings, tournament] = await Promise.all([
      this.prisma.checklist.findMany({
        where: {
          deletedAt: null,
          isActive: true,
          category: 'READINESS',
          currentVersionId: { not: null },
        },
        select: { id: true, category: true, isActive: true, stadiums: { select: { stadiumId: true } } },
      }),
      this.prisma.inspection.findMany({
        where: {
          stadiumId: { in: stadiumIds },
          status: 'SUBMITTED',
          localDate: { in: [...new Set(dates.values())].map(toDateColumn) },
          checklist: { category: 'READINESS' },
        },
        select: { stadiumId: true, checklistId: true, localDate: true },
        distinct: ['stadiumId', 'checklistId', 'localDate'],
      }),
      this.prisma.finding.groupBy({
        by: ['stadiumId'],
        where: { stadiumId: { in: stadiumIds }, status: { not: 'CLOSED' } },
        _count: { _all: true },
      }),
      this.prisma.tournament.findFirst({ where: { isActive: true }, select: { id: true, startDate: true } }),
    ]);

    const readiness = checklists.map((checklist) => ({
      ...checklist,
      stadiumIds: checklist.stadiums.map((row) => row.stadiumId),
    }));
    const openByStadium = new Map(openFindings.map((row) => [row.stadiumId, row._count._all]));

    return Promise.all(
      stadiums.map(async (stadium) => {
        const date = dates.get(stadium.id) as string;
        const expected = readinessChecklistsFor(readiness, stadium.id).map((c) => c.id);
        const done = submitted
          .filter((row) => row.stadiumId === stadium.id && fromDateColumn(row.localDate) === date)
          .map((row) => row.checklistId);
        const progress = stadiumChecklistProgress(expected, done);

        // Tournament to date (or everything up to the date without a tournament).
        const tally = await this.tallyFor({
          from: tournament ? fromDateColumn(tournament.startDate) : '2000-01-01',
          to: date,
          stadiumIds: [stadium.id],
          tournamentId: tournament?.id ?? null,
        });

        return {
          stadiumId: stadium.id,
          code: stadium.code,
          name: stadium.name,
          nameAr: stadium.nameAr,
          city: stadium.city,
          timezone: stadium.timezone,
          date,
          assignedInspectors: stadium.assignments.map((row) => ({
            id: row.user.id,
            fullName: row.user.fullName,
          })),
          checklistsDone: progress.done,
          checklistsExpected: progress.expected,
          progressPercent: progress.percent,
          findingsOpen: openByStadium.get(stadium.id) ?? 0,
          compliancePercent: compliancePercent(tally),
          imageUrl: await this.storage.stadiumImageUrl(stadium.imageKey),
          isActive: stadium.isActive,
        };
      }),
    );
  }

  /* ------------------------- discipline dashboard ------------------------ */

  /**
   * One HSE Observation discipline: observation mix, findings, compliance on its
   * checklists, per-stadium split, a daily series and the items failing most.
   * Scoped like every other KPI.
   */
  async disciplineDashboard(
    disciplineId: string,
    query: DisciplineDashboardQuery,
    actor: RequestUser,
  ): Promise<DisciplineDashboard> {
    const discipline = await this.prisma.discipline.findUnique({ where: { id: disciplineId } });
    if (!discipline) throw AppException.notFound('Discipline', disciplineId);

    const window = await this.resolveWindow(
      { from: query.from, to: query.to, stadiumId: query.stadiumId, disciplineId, compare: false },
      actor,
    );
    const observationWhere = this.observationWhere(window);
    const findingWhere = this.findingWhere(window);

    const [
      observations,
      findingsOpen,
      findingsClosed,
      tally,
      byType,
      bySeverity,
      stadiums,
      obsByStadium,
      findingsByStadium,
      obsDates,
      findingDates,
      topItems,
    ] = await Promise.all([
      this.prisma.observation.count({ where: observationWhere }),
      this.prisma.finding.count({ where: { ...findingWhere, status: { not: 'CLOSED' } } }),
      this.prisma.finding.count({ where: { ...findingWhere, status: 'CLOSED' } }),
      this.tallyFor(window),
      this.prisma.observation.groupBy({
        by: ['type'],
        where: observationWhere,
        _count: { _all: true },
      }),
      this.prisma.observation.groupBy({
        by: ['severity'],
        where: observationWhere,
        _count: { _all: true },
      }),
      this.prisma.stadium.findMany({
        where: {
          deletedAt: null,
          ...(window.stadiumIds ? { id: { in: window.stadiumIds } } : {}),
        },
        select: { id: true, code: true, name: true },
        orderBy: { name: 'asc' },
      }),
      this.prisma.observation.groupBy({
        by: ['stadiumId'],
        where: observationWhere,
        _count: { _all: true },
      }),
      this.prisma.finding.groupBy({
        by: ['stadiumId'],
        where: findingWhere,
        _count: { _all: true },
      }),
      this.prisma.observation.groupBy({
        by: ['localDate'],
        where: observationWhere,
        _count: { _all: true },
      }),
      this.prisma.finding.groupBy({
        by: ['localDate'],
        where: findingWhere,
        _count: { _all: true },
      }),
      this.topRepeatFindings(window),
    ]);

    const typeCounts = new Map(byType.map((row) => [row.type, row._count._all]));
    const severityCounts = new Map(bySeverity.map((row) => [row.severity, row._count._all]));
    const obsStadium = new Map(obsByStadium.map((row) => [row.stadiumId, row._count._all]));
    const findingStadium = new Map(findingsByStadium.map((row) => [row.stadiumId, row._count._all]));
    const obsDaily = new Map(obsDates.map((row) => [fromDateColumn(row.localDate), row._count._all]));
    const findingDaily = new Map(
      findingDates.map((row) => [fromDateColumn(row.localDate), row._count._all]),
    );

    // Keeps the series bounded on a long cumulative window: the last 92 days.
    const days = eachDay(window.from, window.to).slice(-92);

    return {
      discipline: {
        id: discipline.id,
        slug: discipline.slug,
        name: discipline.name,
        nameAr: discipline.nameAr,
        description: discipline.description,
        descriptionAr: discipline.descriptionAr,
        icon: discipline.icon,
        colorToken: discipline.colorToken,
        sortOrder: discipline.sortOrder,
        isActive: discipline.isActive,
      },
      periodStart: window.from,
      periodEnd: window.to,
      totals: {
        observations,
        findingsOpen,
        findingsClosed,
        compliancePercent: compliancePercent(tally),
      },
      byType: OBSERVATION_TYPES.map((type) => ({ type, count: typeCounts.get(type) ?? 0 })),
      bySeverity: SEVERITIES.map((severity) => ({
        severity,
        count: severityCounts.get(severity) ?? 0,
      })),
      byStadium: stadiums.map((stadium) => ({
        stadiumId: stadium.id,
        code: stadium.code,
        name: stadium.name,
        observations: obsStadium.get(stadium.id) ?? 0,
        findings: findingStadium.get(stadium.id) ?? 0,
      })),
      daily: days.map((date) => ({
        date,
        observations: obsDaily.get(date) ?? 0,
        findings: findingDaily.get(date) ?? 0,
      })),
      topFailingItems: topItems.map((item) => ({
        itemCode: item.itemCode,
        question: item.question,
        noCount: item.noCount,
      })),
    };
  }

  /* --------------------------- inspector home -------------------------- */

  /**
   * The inspector's home screen: only their stadiums, only today in each
   * stadium's own zone, plus whether the EOD window is open.
   */
  async inspectorHome(actor: RequestUser, now = new Date()): Promise<InspectorHome> {
    const stadiums = await this.prisma.stadium.findMany({
      where: {
        deletedAt: null,
        isActive: true,
        ...stadiumScopeWhere(actor, 'id'),
      },
      select: { id: true, name: true, timezone: true },
      orderBy: { name: 'asc' },
    });

    const rows = await Promise.all(
      stadiums.map(async (stadium) => {
        const localDate = zonedDateString(now, stadium.timezone);
        const date = toDateColumn(localDate);

        const [inspectionsToday, observationsToday, openFindings, overdueActions, eod] =
          await Promise.all([
            this.prisma.inspection.count({
              where: {
                stadiumId: stadium.id,
                inspectorId: actor.id,
                localDate: date,
                status: 'SUBMITTED',
              },
            }),
            this.prisma.observation.count({
              where: {
                stadiumId: stadium.id,
                inspectorId: actor.id,
                localDate: date,
                status: 'SUBMITTED',
              },
            }),
            this.prisma.finding.count({
              where: { stadiumId: stadium.id, status: { not: 'CLOSED' } },
            }),
            this.prisma.correctiveAction.count({
              where: {
                status: { not: 'CLOSED' },
                dueDate: { lt: date },
                finding: { stadiumId: stadium.id },
              },
            }),
            this.prisma.eodReport.findFirst({
              where: {
                stadiumId: stadium.id,
                inspectorId: actor.id,
                date,
                status: 'SUBMITTED',
              },
              select: { id: true },
            }),
          ]);

        const check = await this.windows.checkSubmission(stadium.id, now);

        return {
          stadiumId: stadium.id,
          stadiumName: stadium.name,
          timezone: stadium.timezone,
          inspectionsToday,
          observationsToday,
          openFindings,
          overdueActions,
          eodSubmitted: Boolean(eod),
          eodWindowOpen: check.open,
          eodClosesAt: check.bounds?.closesAt ?? null,
        };
      }),
    );

    const today = zonedDateString(now, stadiums[0]?.timezone ?? 'UTC');
    const myOpenActions = await this.prisma.correctiveAction.count({
      where: { assigneeId: actor.id, status: { not: 'CLOSED' } },
    });

    // Last 7 days of their own answers, so the home screen has a trend to show.
    const tally = await this.tallyFor(
      {
        from: addDays(today, -6),
        to: today,
        stadiumIds: isStadiumScoped(actor) ? actor.stadiumIds : null,
        tournamentId: null,
      },
      actor.id,
    );

    return {
      date: today,
      stadiums: rows,
      myOpenActions,
      compliancePercent: compliancePercent(tally),
    };
  }

  /* ------------------------------ internals ---------------------------- */

  /** Clamps a request to the caller's scope and fills in sensible defaults. */
  async resolveWindow(query: KpiQuery, actor: RequestUser): Promise<Window> {
    const tournament = query.tournamentId
      ? await this.prisma.tournament.findUnique({ where: { id: query.tournamentId } })
      : await this.prisma.tournament.findFirst({ where: { isActive: true } });

    const today = new Date().toISOString().slice(0, 10);
    const to = query.to ?? (tournament ? minDate(fromDateColumn(tournament.endDate), today) : today);
    const from =
      query.from ??
      (tournament ? maxDate(fromDateColumn(tournament.startDate), addDays(to, -29)) : addDays(to, -29));

    let stadiumIds: string[] | null = null;
    // Supervisors and inspectors are clamped to their assignment.
    if (isStadiumScoped(actor)) {
      stadiumIds = actor.stadiumIds;
      if (query.stadiumId) {
        if (!actor.stadiumIds.includes(query.stadiumId)) throw AppException.outOfScope();
        stadiumIds = [query.stadiumId];
      }
    } else if (query.stadiumId) {
      stadiumIds = [query.stadiumId];
    }

    return {
      from,
      to,
      stadiumIds,
      tournamentId: tournament?.id ?? null,
      disciplineId: query.disciplineId,
    };
  }

  private inspectionWhere(window: Window): Prisma.InspectionWhereInput {
    return {
      status: 'SUBMITTED',
      localDate: { gte: toDateColumn(window.from), lte: toDateColumn(window.to) },
      ...(window.stadiumIds ? { stadiumId: { in: window.stadiumIds } } : {}),
      ...(window.tournamentId ? { tournamentId: window.tournamentId } : {}),
      ...(window.disciplineId ? { checklist: { disciplineId: window.disciplineId } } : {}),
    };
  }

  private observationWhere(window: Window): Prisma.ObservationWhereInput {
    return {
      status: 'SUBMITTED',
      localDate: { gte: toDateColumn(window.from), lte: toDateColumn(window.to) },
      ...(window.stadiumIds ? { stadiumId: { in: window.stadiumIds } } : {}),
      ...(window.tournamentId ? { tournamentId: window.tournamentId } : {}),
      ...(window.disciplineId ? { disciplineId: window.disciplineId } : {}),
    };
  }

  private findingWhere(window: Window): Prisma.FindingWhereInput {
    return {
      localDate: { gte: toDateColumn(window.from), lte: toDateColumn(window.to) },
      ...(window.stadiumIds ? { stadiumId: { in: window.stadiumIds } } : {}),
      ...(window.tournamentId ? { tournamentId: window.tournamentId } : {}),
      ...(window.disciplineId ? { disciplineId: window.disciplineId } : {}),
    };
  }

  /**
   * YES / NO / NA counts over the window, grouped in the database rather than
   * by loading answers into memory.
   */
  private async tallyFor(window: Window, inspectorId?: string): Promise<ResponseTally> {
    const grouped = await this.prisma.inspectionResponse.groupBy({
      by: ['value'],
      where: {
        inspection: {
          ...this.inspectionWhere(window),
          ...(inspectorId ? { inspectorId } : {}),
        },
      },
      _count: { _all: true },
    });

    const tally: ResponseTally = { yes: 0, no: 0, na: 0 };
    for (const group of grouped) {
      if (group.value === 'YES') tally.yes = group._count._all;
      else if (group.value === 'NO') tally.no = group._count._all;
      else tally.na = group._count._all;
    }
    return tally;
  }

  private async severityCounts(window: Window): Promise<SeverityCounts> {
    const grouped = await this.prisma.finding.groupBy({
      by: ['severity'],
      where: this.findingWhere(window),
      _count: { _all: true },
    });
    const counts = emptySeverityCounts();
    for (const group of grouped) counts[group.severity] = group._count._all;
    return counts;
  }

  private async findingRollup(window: Window): Promise<{
    total: number;
    open: number;
    closed: number;
    overdue: number;
    averageDaysToClose: number | null;
  }> {
    const where = this.findingWhere(window);

    const [total, closedRows, overdue] = await Promise.all([
      this.prisma.finding.count({ where }),
      this.prisma.finding.findMany({
        where: { ...where, status: 'CLOSED' },
        select: { localDate: true, closedAt: true },
      }),
      this.prisma.finding.count({
        where: {
          ...where,
          status: { not: 'CLOSED' },
          actions: {
            some: {
              dueDate: { lt: toDateColumn(zonedDateString(new Date(), DEFAULT_TIME_ZONE)) },
              status: { not: 'CLOSED' },
            },
          },
        },
      }),
    ]);

    const closed = closedRows.length;
    const averageDaysToClose =
      closed === 0
        ? null
        : roundTo(
            closedRows.reduce((sum, row) => {
              if (!row.closedAt) return sum;
              return (
                sum +
                Math.max(
                  0,
                  daysBetween(
                    fromDateColumn(row.localDate),
                    row.closedAt.toISOString().slice(0, 10),
                  ),
                )
              );
            }, 0) / closed,
          );

    return { total, open: total - closed, closed, overdue, averageDaysToClose };
  }

  private async eodTotals(window: Window): Promise<{
    submitted: number;
    headcount: number;
    manHours: string;
    recordableIncidents: number;
    nearMisses: number;
  }> {
    const where: Prisma.EodReportWhereInput = {
      status: 'SUBMITTED',
      date: { gte: toDateColumn(window.from), lte: toDateColumn(window.to) },
      ...(window.stadiumIds ? { stadiumId: { in: window.stadiumIds } } : {}),
      ...(window.tournamentId ? { tournamentId: window.tournamentId } : {}),
    };

    const [count, aggregate, manHourRows] = await Promise.all([
      this.prisma.eodReport.count({ where }),
      this.prisma.eodReport.aggregate({
        where,
        _sum: { totalHeadcount: true, recordableIncidents: true, nearMisses: true },
      }),
      // Summed in fixed point rather than with SQL SUM, so the report total
      // matches the sum of the rows exactly.
      this.prisma.eodReport.findMany({ where, select: { totalManHours: true } }),
    ]);

    return {
      submitted: count,
      headcount: aggregate._sum.totalHeadcount ?? 0,
      manHours:
        manHourRows.length === 0
          ? '0.00'
          : addDecimals(...manHourRows.map((row) => row.totalManHours.toFixed(2))),
      recordableIncidents: aggregate._sum.recordableIncidents ?? 0,
      nearMisses: aggregate._sum.nearMisses ?? 0,
    };
  }

  /** One EOD per assigned inspector per stadium per day in the window. */
  private async expectedEodCount(window: Window): Promise<number> {
    const assignments = await this.prisma.stadiumAssignment.count({
      where: {
        ...(window.stadiumIds ? { stadiumId: { in: window.stadiumIds } } : {}),
        user: { deletedAt: null, status: 'ACTIVE', role: 'INSPECTOR' },
        stadium: { deletedAt: null, isActive: true },
      },
    });
    return assignments * (daysBetween(window.from, window.to) + 1);
  }
}

function minDate(a: string, b: string): string {
  return a < b ? a : b;
}

function maxDate(a: string, b: string): string {
  return a > b ? a : b;
}

export type { Window as KpiWindow };
