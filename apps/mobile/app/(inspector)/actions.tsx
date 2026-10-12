import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { FlashList } from '@shopify/flash-list';
import { CalendarClock, ListChecks } from 'lucide-react-native';
import type { FindingStatus } from '@ahlan/shared';

import {
  ChipRow,
  EmptyState,
  PressableCard,
  Screen,
  SeverityBadge,
  SkeletonList,
  StatusBadge,
  Text,
} from '../../src/components';
import { useFindings } from '../../src/features/findings/hooks';
import { useStadiums } from '../../src/features/catalog/hooks';
import { useSettingsStore } from '../../src/store/settings';
import { useAuthStore } from '../../src/store/auth';
import { usePalette } from '../../src/theme/theme-provider';
import { cn } from '../../src/utils/cn';

type ActionFilter = 'open' | 'overdue' | 'all';

/**
 * My Actions: findings whose corrective action is assigned to me, read from
 * the local database (so it works on site with no signal). Overdue is derived
 * from the due date exactly as on the server and is highlighted.
 */
export default function MyActionsScreen(): React.JSX.Element {
  const { t } = useTranslation();
  const palette = usePalette();
  const locale = useSettingsStore((state) => state.locale);
  const userId = useAuthStore((state) => state.user?.id ?? '');
  const { stadiums } = useStadiums();
  const [filter, setFilter] = useState<ActionFilter>('open');

  // assignedToMe excludes CLOSED actions; "all" also keeps my closed ones.
  const { rows, loading } = useFindings({ assignedToMe: filter !== 'all' });

  const stadiumName = useMemo(() => {
    const map = new Map(stadiums.map((stadium) => [stadium.id, stadium]));
    return (id: string) => map.get(id)?.displayName(locale) ?? '';
  }, [stadiums, locale]);

  const items = useMemo(
    () =>
      rows
        .map((row) => ({
          ...row,
          action: row.actions.find((action) => action.assigneeId === userId) ?? null,
        }))
        .filter((row) => row.action !== null)
        .filter((row) => (filter === 'overdue' ? row.action?.isOverdue : true))
        // Overdue first, then by due date.
        .sort((a, b) => {
          const overdue = Number(Boolean(b.action?.isOverdue)) - Number(Boolean(a.action?.isOverdue));
          if (overdue !== 0) return overdue;
          return (a.action?.dueDate ?? '9999').localeCompare(b.action?.dueDate ?? '9999');
        }),
    [rows, userId, filter],
  );

  return (
    <Screen title={t('nav.myActions')} subtitle={t('nav.actionsPage.subtitle')} scroll={false} wide>
      <ChipRow
        className="mb-4"
        options={[
          { value: 'open', label: t('nav.actionsPage.filters.open') },
          { value: 'overdue', label: t('nav.actionsPage.filters.overdue') },
          { value: 'all', label: t('nav.actionsPage.filters.all') },
        ]}
        value={filter}
        onChange={(value) => setFilter((value as ActionFilter | null) ?? 'open')}
      />

      <View className="flex-1 px-gutter">
        {loading ? (
          <SkeletonList count={5} />
        ) : items.length === 0 ? (
          <EmptyState
            title={t('nav.actionsPage.emptyTitle')}
            body={t('nav.actionsPage.emptyBody')}
            icon={<ListChecks size={36} color={palette.primary} />}
          />
        ) : (
          <FlashList
            data={items}
            keyExtractor={(item) => item.finding.id}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 24 }}
            ItemSeparatorComponent={() => <View className="h-3" />}
            renderItem={({ item }) => {
              const overdue = Boolean(item.action?.isOverdue);
              return (
                <PressableCard
                  accessibilityLabel={`${item.finding.title}${overdue ? `, ${t('findings.statuses.OVERDUE')}` : ''}`}
                  onPress={() => router.push(`/(inspector)/findings/${item.finding.id}`)}
                  className={cn('gap-3 p-4', overdue && 'border-danger')}
                >
                  <View className="flex-row items-start justify-between gap-3">
                    <View className="flex-1 gap-1">
                      <Text variant="overline" tone="subtle" numberOfLines={1}>
                        {item.finding.reference} · {stadiumName(item.finding.stadiumId)}
                      </Text>
                      <Text variant="heading" numberOfLines={2}>
                        {item.finding.title}
                      </Text>
                    </View>
                    <SeverityBadge severity={item.finding.severity} />
                  </View>
                  {item.action?.action ? (
                    <Text variant="callout" tone="muted" numberOfLines={2}>
                      {item.action.action}
                    </Text>
                  ) : null}
                  <View className="flex-row flex-wrap items-center justify-between gap-2">
                    <StatusBadge
                      status={(item.action?.status ?? item.finding.status) as FindingStatus}
                      isOverdue={overdue}
                    />
                    {item.action?.dueDate ? (
                      <View
                        className={cn(
                          'flex-row items-center gap-1.5 rounded-full px-2.5 py-1',
                          overdue ? 'bg-danger-soft' : 'bg-surface-sunken',
                        )}
                      >
                        <CalendarClock size={14} color={overdue ? palette.danger : palette.fgMuted} />
                        <Text variant="caption" tone={overdue ? 'danger' : 'muted'} tabular>
                          {t('nav.actionsPage.due', { date: item.action.dueDate })}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                </PressableCard>
              );
            }}
          />
        )}
      </View>
    </Screen>
  );
}
