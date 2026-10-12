import { z } from 'zod';

import { FINDING_STATUSES, OBSERVATION_TYPES, SEVERITIES } from '../enums';
import { disciplineSchema } from './catalog';
import {
  dateRangeQuerySchema,
  idSchema,
  isoDateSchema,
  queryBooleanSchema,
  timestampSchema,
} from './common';

/**
 * Read models behind the dashboards and the PDF report bodies. Every number here
 * comes out of `kpi.ts`, computed from rows in our own database.
 */

export const severityBreakdownSchema = z.object({
  LOW: z.number().int().min(0),
  MEDIUM: z.number().int().min(0),
  HIGH: z.number().int().min(0),
  CRITICAL: z.number().int().min(0),
});
export type SeverityBreakdown = z.infer<typeof severityBreakdownSchema>;

export const statusBreakdownSchema = z.object(
  Object.fromEntries(FINDING_STATUSES.map((status) => [status, z.number().int().min(0)])) as Record<
    (typeof FINDING_STATUSES)[number],
    z.ZodNumber
  >,
);
export type StatusBreakdown = z.infer<typeof statusBreakdownSchema>;

export const kpiSummarySchema = z.object({
  periodStart: isoDateSchema,
  periodEnd: isoDateSchema,
  inspections: z.number().int().min(0),
  observations: z.number().int().min(0),
  eodSubmitted: z.number().int().min(0),
  eodExpected: z.number().int().min(0),
  yesCount: z.number().int().min(0),
  noCount: z.number().int().min(0),
  naCount: z.number().int().min(0),
  /** YES / (YES + NO) x 100, NA excluded. Null when nothing was answerable. */
  compliancePercent: z.number().nullable(),
  complianceBand: z
    .enum(['CRITICAL', 'POOR', 'FAIR', 'GOOD', 'EXCELLENT'])
    .nullable(),
  /** Change in percentage points against the previous equivalent period. */
  complianceDelta: z.number().nullable(),
  riskIndex: z.number(),
  findingsTotal: z.number().int().min(0),
  findingsOpen: z.number().int().min(0),
  findingsClosed: z.number().int().min(0),
  findingsOverdue: z.number().int().min(0),
  closureRate: z.number().nullable(),
  averageDaysToClose: z.number().nullable(),
  totalHeadcount: z.number().int().min(0),
  totalManHours: z.string(),
  recordableIncidents: z.number().int().min(0),
  nearMisses: z.number().int().min(0),
  incidentRate: z.number().nullable(),
  severity: severityBreakdownSchema,
  generatedAt: timestampSchema,
});
export type KpiSummary = z.infer<typeof kpiSummarySchema>;

export const stadiumKpiSchema = kpiSummarySchema.extend({
  stadiumId: idSchema,
  stadiumName: z.string(),
  stadiumCode: z.string(),
});
export type StadiumKpi = z.infer<typeof stadiumKpiSchema>;

export const disciplineKpiSchema = z.object({
  disciplineId: idSchema,
  disciplineName: z.string(),
  observations: z.number().int().min(0),
  findings: z.number().int().min(0),
  compliancePercent: z.number().nullable(),
  severity: severityBreakdownSchema,
  byType: z.object(
    Object.fromEntries(
      OBSERVATION_TYPES.map((type) => [type, z.number().int().min(0)]),
    ) as Record<(typeof OBSERVATION_TYPES)[number], z.ZodNumber>,
  ),
});
export type DisciplineKpi = z.infer<typeof disciplineKpiSchema>;

export const inspectorKpiSchema = z.object({
  inspectorId: idSchema,
  inspectorName: z.string(),
  inspections: z.number().int().min(0),
  observations: z.number().int().min(0),
  eodSubmitted: z.number().int().min(0),
  eodExpected: z.number().int().min(0),
  eodCompliance: z.number().nullable(),
  compliancePercent: z.number().nullable(),
});
export type InspectorKpi = z.infer<typeof inspectorKpiSchema>;

export const trendPointSchema = z.object({
  date: isoDateSchema,
  compliancePercent: z.number().nullable(),
  inspections: z.number().int().min(0),
  findingsRaised: z.number().int().min(0),
  findingsClosed: z.number().int().min(0),
});
export type TrendPoint = z.infer<typeof trendPointSchema>;

export const dashboardSchema = z.object({
  summary: kpiSummarySchema,
  trend: z.array(trendPointSchema),
  byStadium: z.array(stadiumKpiSchema),
  byDiscipline: z.array(disciplineKpiSchema),
  topRepeatFindings: z.array(
    z.object({
      itemCode: z.string(),
      question: z.string(),
      noCount: z.number().int().min(0),
      severity: z.enum(SEVERITIES),
    }),
  ),
});
export type Dashboard = z.infer<typeof dashboardSchema>;

/** Inspector home screen: only their stadiums, only today. */
export const inspectorHomeSchema = z.object({
  date: isoDateSchema,
  stadiums: z.array(
    z.object({
      stadiumId: idSchema,
      stadiumName: z.string(),
      timezone: z.string(),
      inspectionsToday: z.number().int().min(0),
      observationsToday: z.number().int().min(0),
      openFindings: z.number().int().min(0),
      overdueActions: z.number().int().min(0),
      eodSubmitted: z.boolean(),
      eodWindowOpen: z.boolean(),
      eodClosesAt: timestampSchema.nullable(),
    }),
  ),
  myOpenActions: z.number().int().min(0),
  compliancePercent: z.number().nullable(),
});
export type InspectorHome = z.infer<typeof inspectorHomeSchema>;

export const kpiQuerySchema = dateRangeQuerySchema.and(
  z.object({
    stadiumId: idSchema.optional(),
    tournamentId: idSchema.optional(),
    disciplineId: idSchema.optional(),
    /** Compare against the immediately preceding window of equal length. */
    compare: queryBooleanSchema.default(true),
  }),
);
export type KpiQuery = z.infer<typeof kpiQuerySchema>;

/* ------------------------------ stadium cards ------------------------------ */

export const stadiumCardsQuerySchema = z.object({
  /** Stadium-local date; defaults to today in each stadium's zone. */
  date: isoDateSchema.optional(),
});
export type StadiumCardsQuery = z.infer<typeof stadiumCardsQuerySchema>;

/**
 * One stadium card. `checklistsDone` = distinct READINESS checklists with a
 * SUBMITTED inspection at the stadium on `date`; `checklistsExpected` = active
 * READINESS checklists that apply to it. Compliance is tournament to date.
 */
export const stadiumCardKpiSchema = z.object({
  stadiumId: idSchema,
  code: z.string(),
  name: z.string(),
  nameAr: z.string().nullable(),
  city: z.string().nullable(),
  timezone: z.string(),
  date: isoDateSchema,
  assignedInspectors: z.array(z.object({ id: idSchema, fullName: z.string() })),
  checklistsDone: z.number().int().min(0),
  checklistsExpected: z.number().int().min(0),
  /** done / expected x 100, 2dp; null when nothing is expected. */
  progressPercent: z.number().nullable(),
  findingsOpen: z.number().int().min(0),
  compliancePercent: z.number().nullable(),
  /** Uploaded stadium photo (presigned GET); null = bundled photo by code, then placeholder. */
  imageUrl: z.string().url().nullable().optional(),
  /** Admin cards include inactive stadiums; badge them. */
  isActive: z.boolean().optional(),
});
export type StadiumCardKpi = z.infer<typeof stadiumCardKpiSchema>;

/* --------------------------- discipline dashboard -------------------------- */

export const disciplineDashboardQuerySchema = dateRangeQuerySchema.and(
  z.object({
    stadiumId: idSchema.optional(),
  }),
);
export type DisciplineDashboardQuery = z.infer<typeof disciplineDashboardQuerySchema>;

export const disciplineDashboardSchema = z.object({
  discipline: disciplineSchema,
  periodStart: isoDateSchema,
  periodEnd: isoDateSchema,
  totals: z.object({
    observations: z.number().int().min(0),
    findingsOpen: z.number().int().min(0),
    findingsClosed: z.number().int().min(0),
    /** From answers to this discipline's checklists; null when nothing answerable. */
    compliancePercent: z.number().nullable(),
  }),
  byType: z.array(z.object({ type: z.enum(OBSERVATION_TYPES), count: z.number().int().min(0) })),
  bySeverity: z.array(z.object({ severity: z.enum(SEVERITIES), count: z.number().int().min(0) })),
  byStadium: z.array(
    z.object({
      stadiumId: idSchema,
      code: z.string(),
      name: z.string(),
      observations: z.number().int().min(0),
      findings: z.number().int().min(0),
    }),
  ),
  daily: z.array(
    z.object({
      date: isoDateSchema,
      observations: z.number().int().min(0),
      findings: z.number().int().min(0),
    }),
  ),
  topFailingItems: z.array(
    z.object({ itemCode: z.string(), question: z.string(), noCount: z.number().int().min(0) }),
  ),
});
export type DisciplineDashboard = z.infer<typeof disciplineDashboardSchema>;
