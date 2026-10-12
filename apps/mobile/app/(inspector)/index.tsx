import { useCallback } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { zonedDateString } from '@ahlan/shared';

import {
  Appear,
  Badge,
  ComplianceMeter,
  CountUp,
  EmptyState,
  HeroSurface,
  KpiCard,
  PressableCard,
  Screen,
  Section,
  SkeletonKpiGrid,
  Text,
} from '../../src/components';
import { Icon, type IconName } from '../../src/components/icon';
import { elevation, fonts } from '../../src/theme/tokens';
import { useStadiums } from '../../src/features/catalog/hooks';
import { useFindings, useMyOpenActionCount } from '../../src/features/findings/hooks';
import { useAuthStore } from '../../src/store/auth';
import { useSettingsStore } from '../../src/store/settings';
import { useInspectorHome } from '../../src/features/admin/hooks';
import { formatCountdown, formatLongDate } from '../../src/utils/format';
import { useNow } from '../../src/hooks/use-now';

/**
 * The inspector's home screen.
 *
 * Built around the three things they actually do - start an inspection, record
 * an observation, submit the EOD - with each stadium's state on one card so a
 * person covering two venues can see at a glance what is still outstanding.
 */
export default function InspectorHomeScreen(): React.JSX.Element {
  const { t } = useTranslation();
  const user = useAuthStore((state) => state.user);
  const locale = useSettingsStore((state) => state.locale);
  const { stadiums, loading: loadingStadiums } = useStadiums();
  const openActions = useMyOpenActionCount();
  const { rows: overdueRows } = useFindings({ overdueOnly: true });
  // Ticks once a minute so the window countdown stays honest.
  const now = useNow(60_000);

  // The summary comes from the API when there is a connection; the stadium
  // cards below work entirely from the local database either way.
  const { data: summary, isLoading: loadingSummary, refetch } = useInspectorHome();

  const onRefresh = useCallback(async () => {
    await refetch();
  }, [refetch]);

  const firstName = user?.fullName.split(' ')[0] ?? '';
  const initials = (user?.fullName ?? '')
    .split(' ')
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();

  const inspectionsToday =
    summary?.stadiums.reduce((sum, stadium) => sum + stadium.inspectionsToday, 0) ?? 0;

  return (
    <Screen
      title={t('home.greeting', { name: firstName })}
      subtitle={formatLongDate(now, locale)}
      headerAction={
        <View className="h-12 w-12 items-center justify-center rounded-full bg-primary-fill">
          <Text variant="heading" tone="onPrimary">
            {initials || '•'}
          </Text>
        </View>
      }
      onRefresh={onRefresh}
      contentClassName="gap-6"
    >
      {/* Compliance, last 7 days: the one figure the day is judged by, set
          large on the graphite hero so it reads as the headline, with the
          instrument meter underneath. */}
      <Appear index={0}>
        <HeroSurface className="gap-5 rounded-xl p-6" style={elevation.raised}>
          <View className="flex-row items-start justify-between gap-3">
            <Text variant="overline" tone="onHero" className="flex-1 opacity-70">
              {t('home.complianceLast7')}
            </Text>
            {openActions > 0 ? (
              <View className="flex-row items-center gap-1.5 rounded-full bg-primary-fill px-3 py-1">
                <Text variant="overline" tone="onPrimary">
                  {t('home.myActions')} · {openActions}
                </Text>
              </View>
            ) : null}
          </View>

          <CountUp
            value={
              summary?.compliancePercent === null || summary?.compliancePercent === undefined
                ? '—'
                : `${Math.round(summary.compliancePercent)}%`
            }
            render={(text) => (
              <Text variant="numeral" tone="onHero" tabular>
                {text}
              </Text>
            )}
          />

          <ComplianceMeter percent={summary?.compliancePercent ?? null} />

          <Text variant="callout" tone="onHero" className="opacity-75">
            {summary
              ? t('home.todayAcrossStadiums', {
                  inspections: inspectionsToday,
                  stadiums: summary.stadiums.length,
                })
              : t('common.loading')}
          </Text>
        </HeroSurface>
      </Appear>

      {/* Quick actions: the main job is the volt tile, the second is quieter. */}
      <Appear index={1} className="flex-row gap-3">
        <ActionTile
          primary
          icon="inspections"
          label={t('home.startInspection')}
          hint={t('home.startInspectionHint')}
          onPress={() => router.push('/(inspector)/inspections/new')}
        />
        <ActionTile
          icon="observations"
          label={t('home.newObservation')}
          hint={t('home.newObservationHint')}
          onPress={() => router.push('/(inspector)/observations/new')}
        />
      </Appear>

      {/* Outstanding work */}
      <Appear index={2}>
        <Section title={t('kpi.findings')}>
          <View className="flex-row flex-wrap gap-3">
            <KpiCard
              label={t('home.myActions')}
              value={String(openActions)}
              tone={openActions > 0 ? 'warning' : 'default'}
              onPress={() => router.navigate('/(inspector)/actions')}
            />
            <KpiCard
              label={t('home.overdueActions')}
              value={String(overdueRows.length)}
              tone={overdueRows.length > 0 ? 'danger' : 'default'}
              onPress={() => router.push('/(inspector)/findings?overdue=1')}
            />
          </View>
        </Section>
      </Appear>

      {/* Per-stadium state */}
      <Section title={t('home.myStadiums')}>
        {loadingStadiums || (loadingSummary && !summary) ? (
          <SkeletonKpiGrid count={2} />
        ) : stadiums.length === 0 ? (
          <EmptyState title={t('states.emptyTitle')} body={t('errors.STADIUM_OUT_OF_SCOPE')} />
        ) : (
          <View className="gap-3">
            {stadiums.map((stadium, stadiumIndex) => {
              const state = summary?.stadiums.find((row) => row.stadiumId === stadium.id);
              const localDate = zonedDateString(new Date(), stadium.timezone);

              return (
                <Appear key={stadium.id} index={3 + stadiumIndex}>
                  <PressableCard
                    accessibilityLabel={stadium.name}
                    onPress={() => router.push(`/(inspector)/eod?stadiumId=${stadium.id}`)}
                  >
                    <View className="gap-4">
                      <View className="flex-row items-center gap-3">
                        <View className="h-12 w-12 items-center justify-center rounded-md bg-primary-strong">
                          <Text variant="callout" tone="onHero" style={{ fontFamily: fonts.displayBold }}>
                            {stadium.code.slice(0, 3)}
                          </Text>
                        </View>
                        <View className="flex-1 gap-1.5">
                          <Text variant="heading" numberOfLines={1}>
                            {stadium.name}
                          </Text>
                          {/* Date and EOD state share the second line, so a long
                              status can never squeeze the venue name. */}
                          <View className="flex-row flex-wrap items-center gap-2">
                            <Text variant="caption" tone="subtle" numberOfLines={1}>
                              {localDate}
                            </Text>
                            {state?.eodSubmitted ? (
                              <Badge label={t('home.eodDone')} tone="success" />
                            ) : state?.eodWindowOpen ? (
                              <Badge
                                label={
                                  state.eodClosesAt
                                    ? t('home.eodClosesIn', {
                                        time: formatCountdown(
                                          new Date(state.eodClosesAt).getTime() - now,
                                        ),
                                      })
                                    : t('home.eodDue')
                                }
                                tone="warning"
                              />
                            ) : (
                              <Badge label={t('home.eodWindowShut')} tone="neutral" />
                            )}
                          </View>
                        </View>
                        <Icon name="chevron" size={18} tone="muted" />
                      </View>

                      <View className="flex-row rounded-md bg-surface-sunken px-1 py-3">
                        <Metric
                          label={t('home.metricInspections')}
                          value={state?.inspectionsToday ?? 0}
                        />
                        <View className="w-px bg-border" />
                        <Metric
                          label={t('home.metricObservations')}
                          value={state?.observationsToday ?? 0}
                        />
                        <View className="w-px bg-border" />
                        <Metric
                          label={t('home.openFindings')}
                          value={state?.openFindings ?? 0}
                          tone={(state?.openFindings ?? 0) > 0 ? 'warning' : 'default'}
                        />
                      </View>
                    </View>
                  </PressableCard>
                </Appear>
              );
            })}
          </View>
        )}
      </Section>
    </Screen>
  );
}

function ActionTile({
  icon,
  label,
  hint,
  onPress,
  primary = false,
}: {
  icon: IconName;
  label: string;
  hint: string;
  onPress: () => void;
  /** The volt tile: the one thing this screen most wants you to do. */
  primary?: boolean;
}): React.JSX.Element {
  return (
    <View className="flex-1">
      <PressableCard
        accessibilityLabel={label}
        onPress={onPress}
        tone={primary ? 'volt' : 'default'}
      >
        <View className="min-h-[124px] justify-between gap-4">
          <View className="flex-row items-start justify-between">
            <View
              className={
                primary
                  ? 'h-12 w-12 items-center justify-center rounded-full bg-primary-strong'
                  : 'h-12 w-12 items-center justify-center rounded-full bg-primary-soft'
              }
            >
              <Icon name={icon} size={22} tone={primary ? 'onHero' : 'primary'} />
            </View>
            <Icon name="arrow-up-right" size={20} tone={primary ? 'onPrimary' : 'muted'} />
          </View>
          <View className="gap-0.5">
            <Text variant="heading" tone={primary ? 'onPrimary' : 'default'} numberOfLines={2}>
              {label}
            </Text>
            <Text
              variant="caption"
              tone={primary ? 'onPrimary' : 'subtle'}
              className={primary ? 'opacity-70' : undefined}
              numberOfLines={2}
            >
              {hint}
            </Text>
          </View>
        </View>
      </PressableCard>
    </View>
  );
}

function Metric({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  value: number;
  tone?: 'default' | 'warning';
}): React.JSX.Element {
  return (
    <View className="flex-1 items-center gap-0.5">
      <Text variant="heading" tone={tone === 'warning' ? 'warning' : 'default'} tabular>
        {value}
      </Text>
      <Text variant="caption" tone="subtle" numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}
