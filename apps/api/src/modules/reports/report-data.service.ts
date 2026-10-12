import { Injectable } from '@nestjs/common';
import type { Report } from '@prisma/client';
import {
  isOverdue,
  type DisciplineKpi,
  type InspectorKpi,
  type KpiSummary,
  type StadiumKpi,
  type TrendPoint,
} from '@ahlan/shared';

import { PrismaService } from '../../prisma/prisma.service';
import { fromDateColumn } from '../../common/util/local-date';
import { KpisService, type KpiWindow } from '../kpis/kpis.service';

export interface ReportFindingRow {
  reference: string;
  stadiumName: string;
  title: string;
  severity: string;
  status: string;
  raisedOn: string;
  dueDate: string | null;
  isOverdue: boolean;
  assignee: string | null;
}

export interface ReportAiInsight {
  title: string;
  body: string;
  bullets: string[];
  kind: string;
  reviewedAt: Date | null;
}

/** Daily HSE statistics summed over the EOD reports submitted in the period. */
export interface ReportEodStats {
  reports: number;
  totalSpectators: number;
  workRelatedMedical: number;
  nonWorkRelatedMedical: number;
  firstAidCases: number;
  fireIncidents: number;
  otherIncidents: number;
  hseObservationsReported: number;
}

export interface ReportData {
  meta: {
    type: Report['type'];
    scope: Report['scope'];
    locale: Report['locale'];
    title: string;
    tournamentName: string;
    stadiumName: string | null;
    periodStart: string;
    periodEnd: string;
    generatedAt: Date;
    note: string | null;
  };
  summary: KpiSummary;
  byStadium: StadiumKpi[];
  byDiscipline: DisciplineKpi[];
  byInspector: InspectorKpi[];
  trend: TrendPoint[];
  topRepeatFindings: { itemCode: string; question: string; noCount: number; severity: string }[];
  openCriticalFindings: ReportFindingRow[];
  closedFindings: ReportFindingRow[];
  aiInsights: ReportAiInsight[];
  /** Optional so older callers that build ReportData by hand keep compiling. */
  eodStats?: ReportEodStats;
}

/**
 * Gathers everything a report PDF needs, in one place, from our own database.
 *
 * Note what is deliberately excluded: AI insights are only pulled in when the
 * admin asked for them *and* they have been reviewed and approved. An insight
 * sitting in PENDING_REVIEW never reaches an official report.
 */
@Injectable()
export class ReportDataService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly kpis: KpisService,
  ) {}

  async build(report: Report): Promise<ReportData> {
    const tournament = await this.prisma.tournament.findUniqueOrThrow({
      where: { id: report.tournamentId },
      select: { name: true, nameAr: true },
    });

    const stadium = report.stadiumId
      ? await this.prisma.stadium.findUnique({
          where: { id: report.stadiumId },
          select: { name: true, code: true },
        })
      : null;

    const window: KpiWindow = {
      from: fromDateColumn(report.periodStart),
      to: fromDateColumn(report.periodEnd),
      stadiumIds: report.stadiumId ? [report.stadiumId] : null,
      tournamentId: report.tournamentId,
    };

    const [summary, byStadium, byDiscipline, byInspector, trend, topRepeatFindings] =
      await Promise.all([
        this.kpis.summary(window, true),
        // A single-stadium report does not need a one-row league table.
        report.scope === 'CONSOLIDATED' ? this.kpis.byStadium(window) : Promise.resolve([]),
        this.kpis.byDiscipline(window),
        this.kpis.byInspector(window),
        this.kpis.trend(window),
        this.kpis.topRepeatFindings(window),
      ]);

    const [openCriticalFindings, closedFindings, aiInsights, eodStats] = await Promise.all([
      this.findings(window, 'OPEN'),
      this.findings(window, 'CLOSED'),
      report.includeAiInsights ? this.approvedInsights(report) : Promise.resolve([]),
      this.eodStats(window),
    ]);

    return {
      meta: {
        type: report.type,
        scope: report.scope,
        locale: report.locale,
        title: titleFor(report.type),
        tournamentName:
          report.locale === 'ar' ? (tournament.nameAr ?? tournament.name) : tournament.name,
        stadiumName: stadium?.name ?? null,
        periodStart: window.from,
        periodEnd: window.to,
        generatedAt: new Date(),
        note: report.note,
      },
      summary,
      byStadium,
      byDiscipline,
      byInspector,
      trend,
      topRepeatFindings,
      openCriticalFindings,
      closedFindings,
      aiInsights,
      eodStats,
    };
  }

  private async eodStats(window: KpiWindow): Promise<ReportEodStats> {
    const aggregate = await this.prisma.eodReport.aggregate({
      where: {
        status: 'SUBMITTED',
        date: { gte: new Date(`${window.from}T00:00:00Z`), lte: new Date(`${window.to}T00:00:00Z`) },
        ...(window.stadiumIds ? { stadiumId: { in: window.stadiumIds } } : {}),
        ...(window.tournamentId ? { tournamentId: window.tournamentId } : {}),
      },
      _count: { _all: true },
      _sum: {
        totalSpectators: true,
        workRelatedMedical: true,
        nonWorkRelatedMedical: true,
        firstAidCases: true,
        fireIncidents: true,
        otherIncidents: true,
        hseObservationsReported: true,
      },
    });
    const sum = aggregate._sum;
    return {
      reports: aggregate._count._all,
      totalSpectators: sum.totalSpectators ?? 0,
      workRelatedMedical: sum.workRelatedMedical ?? 0,
      nonWorkRelatedMedical: sum.nonWorkRelatedMedical ?? 0,
      firstAidCases: sum.firstAidCases ?? 0,
      fireIncidents: sum.fireIncidents ?? 0,
      otherIncidents: sum.otherIncidents ?? 0,
      hseObservationsReported: sum.hseObservationsReported ?? 0,
    };
  }

  /** Open findings are ordered worst-first; closed ones are evidence of progress. */
  private async findings(window: KpiWindow, mode: 'OPEN' | 'CLOSED'): Promise<ReportFindingRow[]> {
    const rows = await this.prisma.finding.findMany({
      where: {
        localDate: { gte: new Date(`${window.from}T00:00:00Z`), lte: new Date(`${window.to}T00:00:00Z`) },
        ...(window.stadiumIds ? { stadiumId: { in: window.stadiumIds } } : {}),
        ...(window.tournamentId ? { tournamentId: window.tournamentId } : {}),
        ...(mode === 'OPEN'
          ? { status: { not: 'CLOSED' }, severity: { in: ['HIGH', 'CRITICAL'] } }
          : { status: 'CLOSED' }),
      },
      include: {
        stadium: { select: { name: true } },
        actions: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          include: { assignee: { select: { fullName: true } } },
        },
      },
      orderBy: mode === 'OPEN' ? [{ severity: 'desc' }, { localDate: 'asc' }] : { closedAt: 'desc' },
      take: mode === 'OPEN' ? 100 : 50,
    });

    return rows.map((row) => {
      const action = row.actions[0];
      return {
        reference: row.reference,
        stadiumName: row.stadium.name,
        title: row.title,
        severity: row.severity,
        status: row.status,
        raisedOn: fromDateColumn(row.localDate),
        dueDate: action?.dueDate ? fromDateColumn(action.dueDate) : null,
        isOverdue: isOverdue({ status: row.status, dueDate: action?.dueDate ?? null }),
        assignee: action?.assignee?.fullName ?? action?.responsibleParty ?? null,
      };
    });
  }

  /** Approved insights only - an unreviewed one is not publishable. */
  private async approvedInsights(report: Report): Promise<ReportAiInsight[]> {
    const rows = await this.prisma.aiInsight.findMany({
      where: {
        tournamentId: report.tournamentId,
        reviewStatus: 'APPROVED',
        ...(report.stadiumId ? { OR: [{ stadiumId: report.stadiumId }, { stadiumId: null }] } : {}),
        periodEnd: { lte: report.periodEnd },
        periodStart: { gte: report.periodStart },
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    return rows.map((row) => ({
      title: row.title,
      body: row.body,
      bullets: row.bullets,
      kind: row.kind,
      reviewedAt: row.reviewedAt,
    }));
  }
}

function titleFor(type: Report['type']): string {
  switch (type) {
    case 'WEEKLY':
      return 'Weekly HSE Report';
    case 'CUMULATIVE':
      return 'Cumulative HSE Report';
    default:
      return 'End of Tournament HSE Report';
  }
}
