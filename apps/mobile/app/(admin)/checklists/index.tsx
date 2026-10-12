import { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ClipboardList, Eye, Plus } from 'lucide-react-native';
import { CHECKLIST_CATEGORIES, zonedDateString, type ChecklistCategory } from '@ahlan/shared';

import {
  Appear,
  Badge,
  Button,
  Card,
  ChipRow,
  EmptyState,
  ErrorState,
  ListItem,
  Screen,
  SegmentedControl,
  Skeleton,
  SkeletonList,
  Text,
  TextField,
} from '../../../src/components';
import { ListFooter } from '../../../src/components/list-footer';
import { flatPages } from '../../../src/features/admin/hooks';
import { useChecklistsPage } from '../../../src/features/admin/manage-hooks';
import { ProgressBar } from '../../../src/components/progress-bar';
import { CardGrid, DateStepper, InfoBanner } from '../../../src/features/admin/components/admin-ui';
import { ChecklistTemplateCard } from '../../../src/features/admin/components/checklist-template-card';
import { summariseCompletion, templateTone } from '../../../src/features/admin/completion-summary';
import { REVIEW_TIMEZONE } from '../../../src/features/admin/eod-window-form';
import { useChecklistCompletion } from '../../../src/features/admin/hooks';
import { canManage } from '../../../src/features/admin/roles';
import { useAuthStore } from '../../../src/store/auth';
import { usePalette } from '../../../src/theme/theme-provider';
import { formatPercent } from '../../../src/utils/format';

type View3 = 'today' | 'library';

/**
 * Two views. "Today": the readiness checklists as master template cards
 * (client mockup "Admin checklist dekh…"), each with how many of the expected
 * inspectors completed it on the chosen day. "All checklists": every
 * checklist of every category, where an administrator creates, edits (as a
 * new version), publishes and deletes them. A supervisor reads both.
 */
export default function AdminChecklistsScreen(): React.JSX.Element {
  const { t, i18n } = useTranslation();
  const palette = usePalette();
  const role = useAuthStore((state) => state.user?.role);
  const today = zonedDateString(new Date(), REVIEW_TIMEZONE);
  const [date, setDate] = useState(today);
  const [view, setView] = useState<View3>('today');
  const admin = canManage(role);

  const completion = useChecklistCompletion(date);
  const rows = completion.data ?? [];
  const totals = summariseCompletion(rows);
  const arabic = i18n.language.startsWith('ar');

  const openCompletion = (checklistId: string): void =>
    router.push({
      pathname: '/(admin)/checklists/completion/[id]',
      params: { id: checklistId, date },
    });

  return (
    <Screen
      title={t('checklists.title')}
      subtitle={t('checklists.subtitle')}
      wide
      onRefresh={() => void completion.refetch()}
      contentClassName="gap-5"
      headerAction={
        admin ? (
          <Button
            label={t('checklists.new')}
            size="sm"
            fullWidth={false}
            icon={<Plus size={16} color={palette.onPrimary} />}
            onPress={() => router.push('/(admin)/checklists/edit')}
          />
        ) : undefined
      }
    >
      <Appear index={0}>
        <InfoBanner
          icon={Eye}
          title={admin ? t('checklists.adminView') : t('checklists.supervisorView')}
          body={admin ? t('checklists.adminManageBody') : t('checklists.adminViewBody')}
        />
      </Appear>

      <SegmentedControl<View3>
        options={[
          { value: 'today', label: t('checklists.viewToday') },
          { value: 'library', label: t('checklists.viewLibrary') },
        ]}
        value={view}
        onChange={setView}
      />

      {view === 'library' ? (
        <ChecklistLibrary />
      ) : (
        <>
          <Appear index={1} className="gap-3">
            <DateStepper value={date} onChange={setDate} max={today} />
            <Card className="gap-3">
              {completion.isLoading ? (
                <>
                  <Skeleton height={20} width="55%" />
                  <Skeleton height={8} rounded="full" />
                </>
              ) : (
                <>
                  <View className="flex-row items-end justify-between gap-3">
                    <View className="flex-1 gap-0.5">
                      <Text variant="overline" tone="subtle">
                        {t('checklists.dayCompletion')}
                      </Text>
                      <Text variant="heading">
                        {t('checklists.completedOf', {
                          completed: totals.completed,
                          expected: totals.expected,
                        })}
                      </Text>
                    </View>
                    <Text variant="title" tabular>
                      {formatPercent(totals.percent, '—')}
                    </Text>
                  </View>
                  <ProgressBar value={totals.expected ? totals.completed / totals.expected : 0} />
                  <Text variant="caption" tone={totals.pending > 0 ? 'warning' : 'success'}>
                    {totals.expected === 0
                      ? t('checklists.nobodyExpected')
                      : totals.pending > 0
                        ? t('checklists.pendingCount', { count: totals.pending })
                        : t('checklists.allDone')}
                  </Text>
                </>
              )}
            </Card>
          </Appear>

          {completion.isError ? (
            <ErrorState error={completion.error} onRetry={() => void completion.refetch()} />
          ) : completion.isLoading ? (
            <CardGrid minColumnWidth={240}>
              {Array.from({ length: 6 }, (_, index) => (
                <View
                  key={index}
                  className="gap-3 rounded-lg border border-card-border bg-surface p-5"
                >
                  <Skeleton height={48} width={48} rounded="md" />
                  <Skeleton height={14} width="50%" />
                  <Skeleton height={24} width="80%" />
                  <Skeleton height={64} rounded="md" />
                  <Skeleton height={48} rounded="md" />
                </View>
              ))}
            </CardGrid>
          ) : rows.length === 0 ? (
            <EmptyState
              title={t('checklists.emptyTitle')}
              body={t('checklists.emptyBody')}
              icon={<ClipboardList size={40} color={palette.fgMuted} />}
            />
          ) : (
            <CardGrid minColumnWidth={240}>
              {rows.map((row, index) => (
                <Appear key={row.checklistId} index={index + 2}>
                  <ChecklistTemplateCard
                    tone={templateTone(index)}
                    title={arabic && row.titleAr ? row.titleAr : row.title}
                    itemCount={row.itemCount}
                    completed={row.completed}
                    expected={row.expected}
                    pending={row.pending}
                    onView={() =>
                      router.push({
                        pathname: '/(admin)/checklists/[id]',
                        params: { id: row.checklistId },
                      })
                    }
                    onCompletion={() => openCompletion(row.checklistId)}
                  />
                </Appear>
              ))}
            </CardGrid>
          )}
        </>
      )}
    </Screen>
  );
}

/** Every checklist, any category, with search and a category filter. */
function ChecklistLibrary(): React.JSX.Element {
  const { t, i18n } = useTranslation();
  const palette = usePalette();
  const arabic = i18n.language.startsWith('ar');
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<ChecklistCategory | null>(null);
  const list = useChecklistsPage({ search, category });
  const rows = flatPages(list.data);

  return (
    <View className="gap-3">
      <TextField
        placeholder={t('checklists.searchPlaceholder')}
        value={search}
        onChangeText={setSearch}
        autoCapitalize="none"
        returnKeyType="search"
        accessibilityLabel={t('common.search')}
      />
      <ChipRow
        className="-mx-gutter"
        options={CHECKLIST_CATEGORIES.map((value) => ({
          value,
          label: t(`checklists.editor.categoryShort.${value}`),
        }))}
        value={category}
        onChange={setCategory}
      />
      {list.isError && rows.length === 0 ? (
        <ErrorState error={list.error} onRetry={() => void list.refetch()} />
      ) : list.isLoading ? (
        <SkeletonList count={5} />
      ) : rows.length === 0 ? (
        <EmptyState
          title={search || category ? t('checklists.noMatch') : t('checklists.libraryEmpty')}
          icon={<ClipboardList size={40} color={palette.fgMuted} />}
        />
      ) : (
        <>
          {rows.map((checklist, index) => (
            <ListItem
              key={checklist.id}
              index={index}
              title={arabic && checklist.titleAr ? checklist.titleAr : checklist.title}
              subtitle={t(`checklists.categories.${checklist.category}`)}
              meta={
                checklist.currentVersion
                  ? t('checklists.version', { version: checklist.currentVersion })
                  : t('checklists.noPublishedVersion')
              }
              trailing={
                checklist.isActive ? (
                  checklist.currentVersion ? (
                    <Badge label={t('checklists.published')} tone="success" />
                  ) : (
                    <Badge label={t('checklists.draftBadge')} tone="warning" />
                  )
                ) : (
                  <Badge label={t('manage.inactive')} />
                )
              }
              onPress={() =>
                router.push({ pathname: '/(admin)/checklists/[id]', params: { id: checklist.id } })
              }
            />
          ))}
          <ListFooter
            loadingMore={list.isFetchingNextPage}
            hasMore={Boolean(list.hasNextPage)}
            error={list.isFetchNextPageError}
            onRetry={() => void list.fetchNextPage()}
            count={rows.length}
          />
          {list.hasNextPage && !list.isFetchingNextPage ? (
            <Button
              label={t('admin.loadMore')}
              variant="ghost"
              onPress={() => void list.fetchNextPage()}
            />
          ) : null}
        </>
      )}
    </View>
  );
}
