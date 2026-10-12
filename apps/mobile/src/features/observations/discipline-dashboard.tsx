import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Q } from '@nozbe/watermelondb';
import {
  addDays,
  zonedDateString,
  type DisciplineDashboard as DisciplineDashboardData,
  type ObservationType,
  type Severity,
} from '@ahlan/shared';

import { Text } from '../../components/text';
import { Card } from '../../components/card';
import { KpiCard } from '../../components/kpi-card';
import { Chip } from '../../components/controls';
import { ErrorState } from '../../components/states';
import { Skeleton, SkeletonKpiGrid } from '../../components/skeleton';
import { BarChart, type BarDatum } from '../../components/bar-chart';
import { severityColor } from '../../theme/tokens';
import { usePalette } from '../../theme/theme-provider';
import { collections } from '../../db';
import type { TournamentModel } from '../../db/models/catalog';
import { useRecords } from '../../hooks/use-watermelon';
import { useNow } from '../../hooks/use-now';
import { useSettingsStore } from '../../store/settings';
import { formatPercent } from '../../utils/format';
import { useDisciplineDashboard } from '../catalog/kpi-hooks';
import { DisciplineIcon } from './discipline-icon';

export type DashboardRange = '7d' | '14d' | 'tournament';

const RANGES: DashboardRange[] = ['7d', '14d', 'tournament'];

/** from/to for a range chip, in the venue zone. Exported for tests. */
export function rangeDates(
  range: DashboardRange,
  today: string,
  tournamentStart: string | null,
): { from?: string; to?: string } {
  if (range === '7d') return { from: addDays(today, -6), to: today };
  if (range === '14d') return { from: addDays(today, -13), to: today };
  // The whole tournament so far; without a cached tournament the API falls
  // back to its default window (the last 30 days inside the active one).
  return tournamentStart && tournamentStart <= today ? { from: tournamentStart, to: today } : {};
}

/**
 * One HSE observation discipline's dashboard: totals, observations by type,
 * by severity and by stadium, a daily trend and the most-failed checklist
 * points, from `GET /kpis/disciplines/:id`.
 *
 * Exported for the admin workspace too; the API scopes the figures to the
 * caller (inspectors and supervisors see their own stadiums only).
 */
export function DisciplineDashboard({
  disciplineId,
  stadiumId,
  timeZone = 'Asia/Riyadh',
}: {
  disciplineId: string;
  stadiumId?: string;
  /** Zone "today" is taken in; every venue in this tournament is Asia/Riyadh. */
  timeZone?: string;
}): React.JSX.Element {
  const { t } = useTranslation();
  const palette = usePalette();
  const locale = useSettingsStore((state) => state.locale);
  const [range, setRange] = useState<DashboardRange>('7d');
  const now = useNow(60_000);
  const today = zonedDateString(new Date(now), timeZone);

  const { records: tournaments } = useRecords<TournamentModel>(
    () => collections.tournaments().query(Q.where('is_active', true)),
    [],
  );
  const dates = rangeDates(range, today, tournaments[0]?.startDate ?? null);
  const query = useDisciplineDashboard(disciplineId, { ...dates, stadiumId });
  const data = query.data;

  const charts = useMemo(() => (data ? buildCharts(data, t, palette) : null), [data, t, palette]);

  return (
    <View className="gap-5">
      {data ? <DashboardHeader data={data} locale={locale} /> : null}

      <View className="flex-row flex-wrap gap-2" accessibilityRole="radiogroup">
        {RANGES.map((value) => (
          <Chip
            key={value}
            label={t(`observations.dashboard.ranges.${value}`)}
            selected={range === value}
            onPress={() => setRange(value)}
          />
        ))}
      </View>

      {query.isLoading ? (
        <View className="gap-4">
          <SkeletonKpiGrid count={4} />
          <Skeleton height={180} rounded="md" />
          <Skeleton height={180} rounded="md" />
        </View>
      ) : query.isError || !data || !charts ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : (
        <>
          <Text variant="caption" tone="subtle">
            {t('observations.dashboard.period', { from: data.periodStart, to: data.periodEnd })}
          </Text>

          <View className="flex-row flex-wrap gap-3">
            <Tile>
              <KpiCard label={t('observations.dashboard.observations')} value={String(data.totals.observations)} />
            </Tile>
            <Tile>
              <KpiCard
                label={t('observations.dashboard.findingsOpen')}
                value={String(data.totals.findingsOpen)}
                tone={data.totals.findingsOpen > 0 ? 'warning' : 'default'}
              />
            </Tile>
            <Tile>
              <KpiCard
                label={t('observations.dashboard.findingsClosed')}
                value={String(data.totals.findingsClosed)}
                tone="success"
              />
            </Tile>
            <Tile>
              <KpiCard
                label={t('kpi.compliance')}
                value={formatPercent(data.totals.compliancePercent, '—')}
              />
            </Tile>
          </View>

          <View className="flex-row flex-wrap gap-4">
            <ChartCard inRow title={t('observations.dashboard.byType')}>
              <BarChart data={charts.byType} />
            </ChartCard>
            <ChartCard inRow title={t('observations.dashboard.bySeverity')}>
              <BarChart data={charts.bySeverity} />
            </ChartCard>
          </View>

          {data.byStadium.length > 1 ? (
            <ChartCard title={t('observations.dashboard.byStadium')}>
              <BarChart data={charts.byStadium} color={palette.info} />
            </ChartCard>
          ) : null}

          <ChartCard title={t('observations.dashboard.daily')}>
            <BarChart data={charts.daily} orientation="vertical" height={150} color={palette.accent} />
          </ChartCard>

          <ChartCard title={t('observations.dashboard.topFailing')}>
            {data.topFailingItems.length === 0 ? (
              <Text variant="callout" tone="muted">
                {t('observations.dashboard.noFailures')}
              </Text>
            ) : (
              <BarChart
                data={data.topFailingItems.map((item) => ({
                  key: item.itemCode,
                  label: `${item.itemCode} · ${item.question}`,
                  value: item.noCount,
                }))}
                color={palette.danger}
                formatValue={(value) => t('observations.dashboard.noCount', { count: value })}
              />
            )}
          </ChartCard>
        </>
      )}
    </View>
  );
}

function DashboardHeader({
  data,
  locale,
}: {
  data: DisciplineDashboardData;
  locale: string;
}): React.JSX.Element {
  const palette = usePalette();
  const name = locale === 'ar' && data.discipline.nameAr ? data.discipline.nameAr : data.discipline.name;
  const description =
    locale === 'ar' && data.discipline.descriptionAr
      ? data.discipline.descriptionAr
      : data.discipline.description;

  return (
    <View className="flex-row items-start gap-4">
      <View className="h-14 w-14 items-center justify-center rounded-md bg-accent-soft">
        <DisciplineIcon name={data.discipline.icon} size={26} color={palette.accent} />
      </View>
      <View className="flex-1 gap-1">
        <Text variant="title">{name}</Text>
        {description ? (
          <Text variant="callout" tone="muted">
            {description}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

function Tile({ children }: { children: React.ReactNode }): React.JSX.Element {
  return <View className="min-w-[150px] flex-1">{children}</View>;
}

/**
 * `inRow` cards share a wrapping row. A standalone card must not take flex-1:
 * in the page column that means a zero flex basis, and on web the card then
 * shrinks below its content and clips the chart.
 */
function ChartCard({
  title,
  inRow = false,
  children,
}: {
  title: string;
  inRow?: boolean;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <View className={inRow ? 'min-w-[280px] flex-1' : undefined}>
      <Card className="gap-4">
        <Text variant="overline" tone="subtle">
          {title}
        </Text>
        {children}
      </Card>
    </View>
  );
}

function buildCharts(
  data: DisciplineDashboardData,
  t: (key: string, options?: Record<string, unknown>) => string,
  palette: ReturnType<typeof usePalette>,
): { byType: BarDatum[]; bySeverity: BarDatum[]; byStadium: BarDatum[]; daily: BarDatum[] } {
  const typeColor: Record<ObservationType, string> = {
    UNSAFE_ACT: palette.danger,
    UNSAFE_CONDITION: palette.warning,
    NEAR_MISS: palette.accent,
    POSITIVE: palette.success,
  };

  return {
    byType: data.byType.map((row) => ({
      key: row.type,
      label: t(`observations.types.${row.type}`),
      value: row.count,
      color: typeColor[row.type],
    })),
    bySeverity: data.bySeverity.map((row) => ({
      key: row.severity,
      label: t(`findings.severities.${row.severity}`),
      value: row.count,
      color: severityColor(row.severity as Severity, palette),
    })),
    byStadium: data.byStadium.map((row) => ({
      key: row.stadiumId,
      label: row.code,
      value: row.observations,
      valueLabel: t('observations.dashboard.stadiumValue', {
        observations: row.observations,
        findings: row.findings,
      }),
    })),
    daily: data.daily.map((row) => ({
      key: row.date,
      // "10-12" reads as a day at axis size; the full date is in the a11y label.
      label: row.date.slice(5),
      value: row.observations,
    })),
  };
}
