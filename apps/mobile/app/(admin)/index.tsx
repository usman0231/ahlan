import { useCallback, useState } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import { elevation } from '../../src/theme/tokens';
import { useTranslation } from 'react-i18next';
import { addDays, complianceBand } from '@ahlan/shared';

import {
  Appear,
  Card,
  ChipRow,
  ComplianceMeter,
  CountUp,
  ErrorState,
  HeroSurface,
  KpiCard,
  MetricBar,
  Screen,
  Section,
  SegmentedControl,
  SkeletonKpiGrid,
  SkeletonText,
  Text,
  TrendChart,
} from '../../src/components';
import { useAllStadiums, useDashboard } from '../../src/features/admin/hooks';
import { OverviewShortcuts } from '../../src/features/admin/components/overview-shortcuts';
import { formatDecimal, formatInt, formatPercent } from '../../src/utils/format';

type Range = '7' | '30' | 'tournament';

/**
 * The administrator's dashboard.
 *
 * Reads the aggregates the API computes, so the figure here is byte-for-byte
 * the one that will appear in the PDF. Stadiums are ordered worst-compliance
 * first: the point of this screen is to find the venue that needs attention.
 */
export default function AdminDashboardScreen(): React.JSX.Element {
  const [chartWidth, setChartWidth] = useState(0);
  const onChartLayout = useCallback((event: LayoutChangeEvent) => {
    setChartWidth(Math.round(event.nativeEvent.layout.width));
  }, []);
  const { t } = useTranslation();
  const [range, setRange] = useState<Range>('30');
  // Null is every stadium the reviewer can see: all of them for an admin,
  // the assigned ones for a supervisor (the API scopes either way).
  const [stadiumId, setStadiumId] = useState<string | null>(null);
  const { data: stadiums } = useAllStadiums();
  const stadiumName = stadiums?.find((stadium) => stadium.id === stadiumId)?.name;

  const today = new Date().toISOString().slice(0, 10);
  const from = range === 'tournament' ? undefined : addDays(today, range === '7' ? -6 : -29);

  const { data, isLoading, isError, error, refetch } = useDashboard({
    from,
    to: today,
    stadiumId: stadiumId ?? undefined,
    compare: true,
  });

  if (isError) {
    return (
      <Screen title={t('admin.dashboard')}>
        <ErrorState error={error} onRetry={() => void refetch()} />
      </Screen>
    );
  }

  const summary = data?.summary;

  return (
    <Screen
      title={t('admin.dashboard')}
      subtitle={
        summary
          ? `${stadiumName ?? t('admin.allStadiums')} · ${summary.periodStart} → ${summary.periodEnd}`
          : undefined
      }
      onRefresh={() => void refetch()}
      contentClassName="gap-6"
    >
      <SegmentedControl
        options={[
          { value: '7', label: '7d' },
          { value: '30', label: '30d' },
          { value: 'tournament', label: t('admin.reportTypes.CUMULATIVE') },
        ]}
        value={range}
        onChange={(value) => setRange(value as Range)}
      />

      {(stadiums ?? []).length > 1 ? (
        <ChipRow
          className="-mx-gutter"
          options={(stadiums ?? []).map((stadium) => ({ value: stadium.id, label: stadium.code }))}
          value={stadiumId}
          onChange={setStadiumId}
        />
      ) : null}

      <OverviewShortcuts />

      {/* Headline compliance, on the graphite hero */}
      <Appear index={0}>
        <HeroSurface className="gap-5 rounded-xl p-6" style={elevation.raised}>
          {isLoading && !summary ? (
            <SkeletonText lines={3} className="opacity-40" />
          ) : (
            <>
              <View className="flex-row items-center justify-between gap-3">
                <Text variant="overline" tone="onHero" className="flex-1 opacity-70">
                  {t('kpi.compliance')}
                </Text>
                <View className="rounded-full bg-primary-fill px-3 py-1">
                  <Text variant="overline" tone="onPrimary">
                    {summary?.complianceBand
                      ? t(`kpi.bands.${summary.complianceBand}`)
                      : t('common.noScore')}
                  </Text>
                </View>
              </View>

              <View className="flex-row flex-wrap items-end gap-x-4 gap-y-1">
                <CountUp
                  value={formatPercent(summary?.compliancePercent ?? null, '—')}
                  render={(text) => (
                    <Text variant="numeral" tone="onHero" tabular>
                      {text}
                    </Text>
                  )}
                />
                {summary?.complianceDelta !== null && summary?.complianceDelta !== undefined ? (
                  <Text variant="callout" tone="onHero" className="mb-2 opacity-80" tabular>
                    {summary.complianceDelta >= 0 ? '↑' : '↓'}{' '}
                    {Math.abs(summary.complianceDelta).toFixed(1)} {t('kpi.vsPrevious')}
                  </Text>
                ) : null}
              </View>

              <ComplianceMeter percent={summary?.compliancePercent ?? null} />

              <Text variant="callout" tone="onHero" className="opacity-75">
                {summary
                  ? `${formatInt(summary.yesCount)} ${t('common.yes')} · ${formatInt(summary.noCount)} ${t('common.no')} · ${formatInt(summary.naCount)} ${t('common.na')}`
                  : ''}
              </Text>
            </>
          )}
        </HeroSurface>
      </Appear>

      {/* Headline figures */}
      {isLoading && !summary ? (
        <SkeletonKpiGrid count={6} />
      ) : summary ? (
        <Appear index={1} className="flex-row flex-wrap gap-3">
          <KpiCard label={t('kpi.inspections')} value={formatInt(summary.inspections)} />
          <KpiCard label={t('kpi.observations')} value={formatInt(summary.observations)} />
          <KpiCard
            label={t('kpi.findings')}
            value={formatInt(summary.findingsTotal)}
            hint={`${summary.findingsOpen} ${t('kpi.open')} · ${summary.findingsClosed} ${t('kpi.closed')}`}
          />
          <KpiCard
            label={t('kpi.overdue')}
            value={formatInt(summary.findingsOverdue)}
            tone={summary.findingsOverdue > 0 ? 'danger' : 'default'}
          />
          <KpiCard
            label={t('kpi.closureRate')}
            value={formatPercent(summary.closureRate, '—')}
            hint={
              summary.averageDaysToClose === null
                ? undefined
                : `${summary.averageDaysToClose} ${t('kpi.avgDaysToClose')}`
            }
          />
          <KpiCard label={t('kpi.riskIndex')} value={String(summary.riskIndex)} />
          <KpiCard label={t('kpi.manHours')} value={formatDecimal(summary.totalManHours)} />
          <KpiCard
            label={t('kpi.headcount')}
            value={formatInt(summary.totalHeadcount)}
            hint={`${t('eod.compliance')} ${summary.eodSubmitted}/${summary.eodExpected}`}
          />
        </Appear>
      ) : null}

      {/* Trend */}
      <Appear index={2}>
        <Section title={t('kpi.trend')}>
          <Card>
            {/* Sized to the card, not the window: on a wide browser the window
              is far wider than the centred column this card actually has. */}
            <View onLayout={onChartLayout}>
              {data?.trend && chartWidth > 0 ? (
                <TrendChart points={data.trend} width={chartWidth} />
              ) : (
                <SkeletonText lines={4} />
              )}
            </View>
          </Card>
        </Section>
      </Appear>

      {/* Per stadium, worst first */}
      <Appear index={3}>
        <Section title={t('kpi.byStadium')}>
          <Card className="gap-4">
            {data?.byStadium.length ? (
              data.byStadium.map((stadium) => (
                <MetricBar
                  key={stadium.stadiumId}
                  label={stadium.stadiumName}
                  percent={stadium.compliancePercent}
                  band={complianceBand(stadium.compliancePercent)}
                  trailing={
                    stadium.findingsOverdue > 0
                      ? `${formatPercent(stadium.compliancePercent)} · ${stadium.findingsOverdue} ${t('kpi.overdue')}`
                      : formatPercent(stadium.compliancePercent)
                  }
                />
              ))
            ) : (
              <SkeletonText lines={4} />
            )}
          </Card>
        </Section>
      </Appear>

      {/* Per discipline */}
      <Appear index={4}>
        <Section title={t('kpi.byDiscipline')}>
          <Card className="gap-4">
            {data?.byDiscipline.length ? (
              data.byDiscipline.map((discipline) => (
                <MetricBar
                  key={discipline.disciplineId}
                  label={discipline.disciplineName}
                  percent={discipline.compliancePercent}
                  band={complianceBand(discipline.compliancePercent)}
                  trailing={`${discipline.findings} ${t('kpi.findings')}`}
                />
              ))
            ) : (
              <SkeletonText lines={4} />
            )}
          </Card>
        </Section>
      </Appear>

      {/* What keeps failing */}
      <Appear index={5}>
        <Section title={t('kpi.repeatFailures')}>
          <Card className="gap-3">
            {data?.topRepeatFindings.length ? (
              data.topRepeatFindings.map((row) => (
                <View key={row.itemCode} className="flex-row items-start gap-3">
                  <Text variant="caption" tone="subtle" tabular className="w-16">
                    {row.itemCode}
                  </Text>
                  <Text variant="caption" className="flex-1" numberOfLines={2}>
                    {row.question}
                  </Text>
                  <Text variant="callout" tone="danger" tabular>
                    {row.noCount}
                  </Text>
                </View>
              ))
            ) : (
              <Text variant="caption" tone="muted">
                {t('states.emptyBody')}
              </Text>
            )}
          </Card>
        </Section>
      </Appear>
    </Screen>
  );
}
