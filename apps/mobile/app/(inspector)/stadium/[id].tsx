import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { CircleCheck, CircleDashed, PencilLine, UserRound } from 'lucide-react-native';
import type { FindingStatus } from '@ahlan/shared';

import {
  Badge,
  Button,
  Card,
  EmptyState,
  KpiCard,
  ListItem,
  Screen,
  Section,
  SeverityBadge,
  Skeleton,
  SkeletonList,
  StatusBadge,
  Text,
} from '../../../src/components';
import { HeaderBar } from '../../../src/components/back-button';
import { StadiumPhotoHeader } from '../../../src/components/stadium-card';
import { ProgressBar } from '../../../src/components/progress-bar';
import { useStadium } from '../../../src/features/catalog/hooks';
import { useStadiumCards } from '../../../src/features/catalog/kpi-hooks';
import { useChecklistCards } from '../../../src/features/inspections/use-checklist-cards';
import { useFindings } from '../../../src/features/findings/hooks';
import { useSettingsStore } from '../../../src/store/settings';
import { usePalette } from '../../../src/theme/theme-provider';
import { formatPercent } from '../../../src/utils/format';

/**
 * One venue: photo header, today's KPIs (from the API when online), today's
 * readiness checklist completion and recent findings (both from the local
 * database, so they show on site with no signal).
 */
export default function StadiumDetailScreen(): React.JSX.Element {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const palette = usePalette();
  const locale = useSettingsStore((state) => state.locale);

  const { stadium, loading } = useStadium(id);
  const cards = useStadiumCards();
  const kpi = cards.data?.find((card) => card.stadiumId === id) ?? null;
  const checklists = useChecklistCards(id ?? null);
  const { rows: findings, loading: loadingFindings } = useFindings({ stadiumId: id ?? null });
  const recent = findings.slice(0, 5);
  const openCount = findings.filter((row) => row.finding.status !== 'CLOSED').length;

  const header = <HeaderBar fallback="/(inspector)/stadium" />;

  if (loading) {
    return (
      <Screen headerAction={header} wide contentClassName="gap-4">
        <Skeleton height={220} rounded="md" />
        <SkeletonList count={4} />
      </Screen>
    );
  }

  if (!stadium) {
    return (
      <Screen headerAction={header}>
        <EmptyState title={t('stadium.notFound')} body={t('errors.STADIUM_OUT_OF_SCOPE')} />
      </Screen>
    );
  }

  const done = kpi?.checklistsDone ?? checklists.progress.done;
  const expected = kpi?.checklistsExpected ?? checklists.progress.expected;

  return (
    <Screen
      headerAction={header}
      onRefresh={async () => {
        await cards.refetch();
      }}
      wide
      contentClassName="gap-6"
    >
      <StadiumPhotoHeader
        code={stadium.code}
        name={stadium.displayName(locale)}
        city={stadium.city}
        imageUrl={kpi?.imageUrl}
        height={220}
        rounded="all"
      />

      {kpi && kpi.assignedInspectors.length > 0 ? (
        <View className="flex-row items-center gap-2">
          <UserRound size={18} color={palette.accent} />
          <Text variant="callout" tone="muted" className="flex-1" numberOfLines={2}>
            {t('stadium.assigned', {
              names: kpi.assignedInspectors.map((inspector) => inspector.fullName).join(', '),
            })}
          </Text>
        </View>
      ) : null}

      <View className="flex-row flex-wrap gap-3">
        <View className="min-w-[150px] flex-1">
          <KpiCard
            label={t('stadium.checklistsToday')}
            value={`${done}/${expected}`}
            tone={expected > 0 && done === expected ? 'success' : 'default'}
          />
        </View>
        <View className="min-w-[150px] flex-1">
          <KpiCard
            label={t('kpi.findings')}
            value={String(kpi?.findingsOpen ?? openCount)}
            tone={(kpi?.findingsOpen ?? openCount) > 0 ? 'warning' : 'default'}
            onPress={() => router.navigate('/(inspector)/findings')}
          />
        </View>
        <View className="min-w-[150px] flex-1">
          <KpiCard
            label={t('kpi.compliance')}
            value={formatPercent(kpi?.compliancePercent ?? null, '—')}
            tone="success"
          />
        </View>
      </View>

      <View className="flex-row gap-3">
        <View className="flex-1">
          <Button
            label={t('home.startInspection')}
            onPress={() => router.navigate('/(inspector)/inspections/new')}
          />
        </View>
        <View className="flex-1">
          <Button
            label={t('nav.eodReport')}
            variant="secondary"
            onPress={() => router.navigate(`/(inspector)/eod?stadiumId=${stadium.id}`)}
          />
        </View>
      </View>

      <Section
        title={t('stadium.todayChecklists')}
        action={
          expected > 0 ? (
            <Badge label={t('inspections.cards.progress', { done, total: expected })} tone="neutral" />
          ) : null
        }
      >
        <Card className="gap-1" padded={false}>
          {expected > 0 ? (
            <View className="px-4 pt-4">
              <ProgressBar value={done / expected} />
            </View>
          ) : null}
          {checklists.loading ? (
            <View className="p-4">
              <SkeletonList count={3} />
            </View>
          ) : checklists.readiness.length === 0 ? (
            <View className="p-4">
              <Text variant="callout" tone="muted">
                {t('inspections.noChecklists')}
              </Text>
            </View>
          ) : (
            checklists.readiness.map((entry, index) => (
              <View
                key={entry.checklist.id}
                className={
                  index > 0
                    ? 'min-h-touch flex-row items-center gap-3 border-t border-border px-4 py-3'
                    : 'min-h-touch flex-row items-center gap-3 px-4 py-3'
                }
              >
                {entry.doneToday ? (
                  <CircleCheck size={20} color={palette.success} />
                ) : entry.draftId ? (
                  <PencilLine size={20} color={palette.warning} />
                ) : (
                  <CircleDashed size={20} color={palette.fgSubtle} />
                )}
                <Text variant="body" className="flex-1" numberOfLines={1}>
                  {entry.checklist.displayTitle(locale)}
                </Text>
                <Text
                  variant="caption"
                  tone={entry.doneToday ? 'success' : entry.draftId ? 'warning' : 'subtle'}
                >
                  {entry.doneToday
                    ? t('inspections.cards.done')
                    : entry.draftId
                      ? t('inspections.cards.draft')
                      : t('inspections.cards.toDo')}
                </Text>
              </View>
            ))
          )}
        </Card>
      </Section>

      <Section title={t('stadium.recentFindings')}>
        {loadingFindings ? (
          <SkeletonList count={3} />
        ) : recent.length === 0 ? (
          <Text variant="callout" tone="muted">
            {t('findings.emptyTitle')}
          </Text>
        ) : (
          <View className="gap-3">
            {recent.map(({ finding, isOverdue }, index) => (
              <ListItem
                key={finding.id}
                index={index}
                title={finding.title}
                meta={`${finding.reference} · ${finding.localDate}`}
                trailing={
                  <View className="items-end gap-1">
                    <SeverityBadge severity={finding.severity} />
                    <StatusBadge status={finding.status as FindingStatus} isOverdue={isOverdue} />
                  </View>
                }
                onPress={() => router.push(`/(inspector)/findings/${finding.id}`)}
              />
            ))}
          </View>
        )}
      </Section>
    </Screen>
  );
}
