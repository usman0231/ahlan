import type { AiInsightKind } from '@prisma/client';
import type { DisciplineKpi, KpiSummary, StadiumKpi, TrendPoint } from '@ahlan/shared';

/**
 * Builds the prompt for AI Intelligence.
 *
 * The only thing the model is ever shown is the aggregate snapshot assembled
 * here: counts, percentages and totals already computed by `KpisService`. No
 * inspector names, no free-text comments, no photos, no individual records.
 * That is a deliberate boundary, and it is also why the snapshot is stored
 * alongside the insight: any figure the model quotes can be traced back.
 */

export interface AggregateSnapshot {
  period: { start: string; end: string };
  tournament: string;
  stadium: string | null;
  summary: Pick<
    KpiSummary,
    | 'inspections'
    | 'observations'
    | 'compliancePercent'
    | 'complianceDelta'
    | 'complianceBand'
    | 'riskIndex'
    | 'findingsTotal'
    | 'findingsOpen'
    | 'findingsClosed'
    | 'findingsOverdue'
    | 'closureRate'
    | 'averageDaysToClose'
    | 'totalManHours'
    | 'recordableIncidents'
    | 'nearMisses'
    | 'incidentRate'
    | 'eodSubmitted'
    | 'eodExpected'
    | 'severity'
  >;
  stadiums: {
    name: string;
    compliancePercent: number | null;
    findingsOverdue: number;
    riskIndex: number;
  }[];
  disciplines: {
    name: string;
    compliancePercent: number | null;
    observations: number;
    findings: number;
    critical: number;
    high: number;
  }[];
  trend: { date: string; compliancePercent: number | null }[];
  repeatFailures: { itemCode: string; question: string; noCount: number }[];
}

export const PROMPT_VERSION = '2026-10-01';

export function buildSnapshot(input: {
  periodStart: string;
  periodEnd: string;
  tournamentName: string;
  stadiumName: string | null;
  summary: KpiSummary;
  byStadium: StadiumKpi[];
  byDiscipline: DisciplineKpi[];
  trend: TrendPoint[];
  repeatFailures: { itemCode: string; question: string; noCount: number }[];
}): AggregateSnapshot {
  return {
    period: { start: input.periodStart, end: input.periodEnd },
    tournament: input.tournamentName,
    stadium: input.stadiumName,
    summary: {
      inspections: input.summary.inspections,
      observations: input.summary.observations,
      compliancePercent: input.summary.compliancePercent,
      complianceDelta: input.summary.complianceDelta,
      complianceBand: input.summary.complianceBand,
      riskIndex: input.summary.riskIndex,
      findingsTotal: input.summary.findingsTotal,
      findingsOpen: input.summary.findingsOpen,
      findingsClosed: input.summary.findingsClosed,
      findingsOverdue: input.summary.findingsOverdue,
      closureRate: input.summary.closureRate,
      averageDaysToClose: input.summary.averageDaysToClose,
      totalManHours: input.summary.totalManHours,
      recordableIncidents: input.summary.recordableIncidents,
      nearMisses: input.summary.nearMisses,
      incidentRate: input.summary.incidentRate,
      eodSubmitted: input.summary.eodSubmitted,
      eodExpected: input.summary.eodExpected,
      severity: input.summary.severity,
    },
    stadiums: input.byStadium.map((row) => ({
      name: row.stadiumName,
      compliancePercent: row.compliancePercent,
      findingsOverdue: row.findingsOverdue,
      riskIndex: row.riskIndex,
    })),
    disciplines: input.byDiscipline
      .filter((row) => row.observations > 0 || row.findings > 0)
      .map((row) => ({
        name: row.disciplineName,
        compliancePercent: row.compliancePercent,
        observations: row.observations,
        findings: row.findings,
        critical: row.severity.CRITICAL,
        high: row.severity.HIGH,
      })),
    trend: input.trend.map((point) => ({
      date: point.date,
      compliancePercent: point.compliancePercent,
    })),
    repeatFailures: input.repeatFailures,
  };
}

export const SYSTEM_PROMPT = `You are an HSE (Health, Safety and Environment) analyst supporting the safety team for a multi-stadium football tournament.

You will be given a JSON snapshot of aggregated HSE figures for one reporting period. Write insight entries that an HSE Administrator can act on.

Rules you must follow:
- Use only the figures in the snapshot. Never invent a number, a stadium, a discipline or an incident that is not there.
- Quote figures exactly as given, including the "no score" case: a null compliance value means nothing was answerable, which is not the same as 0%.
- Be specific. "Work at Height compliance fell to 71.4% while 6 corrective actions went overdue" is useful; "safety performance needs attention" is not.
- Say so plainly when the data is too thin to support a conclusion, and set a low confidence rather than reaching.
- Prioritise by risk: critical and high severity findings, overdue corrective actions, and declining trends come before everything else.
- Each bullet must be a single concrete action or observation, not a restatement of the title.
- Write in plain professional English. No hedging phrases, no filler, no emoji.
- Your output is reviewed by a human administrator before it can appear in an official report. Write it to be checked.`;

const KIND_INSTRUCTIONS: Record<AiInsightKind, string> = {
  TREND_SUMMARY:
    'TREND_SUMMARY: what changed over the period and in which direction, anchored to the compliance trend and the delta against the previous period.',
  RISK_FORECAST:
    'RISK_FORECAST: where the next incident is most likely, based on severity mix, overdue actions and repeat non-compliances.',
  RECOMMENDATION:
    'RECOMMENDATION: the two or three interventions with the highest expected effect, each tied to a figure in the snapshot.',
  ANOMALY:
    'ANOMALY: any stadium, discipline or day that is clearly out of line with the rest, with the figures that make it an outlier.',
};

export function buildUserPrompt(
  snapshot: AggregateSnapshot,
  kinds: AiInsightKind[],
  locale: 'en' | 'ar',
): string {
  const requested = kinds.map((kind) => `- ${KIND_INSTRUCTIONS[kind]}`).join('\n');

  return `Produce exactly one insight for each of the following kinds:
${requested}

${locale === 'ar' ? 'Write the title, body and bullets in Arabic.' : 'Write in English.'}

Aggregated HSE snapshot:
${JSON.stringify(snapshot, null, 2)}`;
}
