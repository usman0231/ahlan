import { useState } from 'react';
import { RefreshControl, View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { FlashList } from '@shopify/flash-list';
import { ScanEye } from 'lucide-react-native';
import { OBSERVATION_TYPES, SEVERITIES, type ObservationType, type Severity } from '@ahlan/shared';

import {
  Badge,
  ChipRow,
  EmptyState,
  ErrorState,
  ListItem,
  Screen,
  SeverityBadge,
  SkeletonList,
} from '../../../../src/components';
import { HeaderBar } from '../../../../src/components/back-button';
import { ListFooter } from '../../../../src/components/list-footer';
import { flatPages, useAllStadiums, useDisciplines } from '../../../../src/features/admin/hooks';
import { useObservationsList } from '../../../../src/features/admin/manage-hooks';
import {
  DeletedBadge,
  ShowDeletedChip,
} from '../../../../src/features/admin/components/record-admin';
import { canManage } from '../../../../src/features/admin/roles';
import { useAuthStore } from '../../../../src/store/auth';
import { usePalette } from '../../../../src/theme/theme-provider';

/**
 * Every submitted HSE observation across the reviewer's stadiums (all of them
 * for an administrator, the assigned ones for a supervisor - the API scopes
 * the list), filtered on the server and paged by cursor. An administrator can
 * include soft-deleted observations to restore one.
 */
export default function AdminObservationsScreen(): React.JSX.Element {
  const { t, i18n } = useTranslation();
  const palette = usePalette();
  const arabic = i18n.language.startsWith('ar');
  const admin = canManage(useAuthStore((state) => state.user?.role));
  const [stadiumId, setStadiumId] = useState<string | null>(null);
  const [disciplineId, setDisciplineId] = useState<string | null>(null);
  const [type, setType] = useState<ObservationType | null>(null);
  const [severity, setSeverity] = useState<Severity | null>(null);
  const [includeDeleted, setIncludeDeleted] = useState(false);

  const { data: stadiums } = useAllStadiums();
  const { data: disciplines } = useDisciplines();
  const list = useObservationsList({
    stadiumId,
    disciplineId,
    type,
    severity,
    includeDeleted: admin && includeDeleted,
  });
  const items = flatPages(list.data);
  const filtered = Boolean(stadiumId || disciplineId || type || severity);

  return (
    <Screen
      headerAction={<HeaderBar backLabel={t('admin.hse.title')} fallback="/(admin)/hse" />}
      title={t('admin.observations.title')}
      subtitle={list.data ? t('admin.review.shown', { count: items.length }) : undefined}
      scroll={false}
    >
      <View className="gap-2 pb-4">
        {(stadiums ?? []).length > 1 ? (
          <ChipRow
            options={(stadiums ?? []).map((stadium) => ({
              value: stadium.id,
              label: stadium.code,
            }))}
            value={stadiumId}
            onChange={setStadiumId}
          />
        ) : null}
        <ChipRow
          options={(disciplines ?? []).map((discipline) => ({
            value: discipline.id,
            label: arabic && discipline.nameAr ? discipline.nameAr : discipline.name,
          }))}
          value={disciplineId}
          onChange={setDisciplineId}
        />
        <ChipRow
          options={OBSERVATION_TYPES.map((value) => ({
            value,
            label: t(`observations.types.${value}`),
          }))}
          value={type}
          onChange={(value) => setType(value as ObservationType | null)}
        />
        <ChipRow
          options={SEVERITIES.map((value) => ({
            value,
            label: t(`findings.severities.${value}`),
          }))}
          value={severity}
          onChange={(value) => setSeverity(value as Severity | null)}
        />
        {admin ? (
          <View className="flex-row px-gutter">
            <ShowDeletedChip value={includeDeleted} onChange={setIncludeDeleted} />
          </View>
        ) : null}
      </View>

      <View className="flex-1 px-gutter">
        {list.isError && items.length === 0 ? (
          <ErrorState error={list.error} onRetry={() => void list.refetch()} />
        ) : list.isLoading ? (
          <SkeletonList count={6} />
        ) : items.length === 0 ? (
          <EmptyState
            title={filtered ? t('admin.review.noMatch') : t('admin.observations.emptyTitle')}
            body={filtered ? undefined : t('admin.observations.emptyBody')}
            icon={<ScanEye size={40} color={palette.fgMuted} />}
          />
        ) : (
          <FlashList
            data={items}
            keyExtractor={(observation) => observation.id}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 24 }}
            ItemSeparatorComponent={() => <View className="h-3" />}
            onEndReachedThreshold={0.5}
            onEndReached={() => {
              if (list.hasNextPage && !list.isFetchingNextPage) void list.fetchNextPage();
            }}
            refreshControl={
              <RefreshControl
                refreshing={list.isRefetching && !list.isFetchingNextPage}
                onRefresh={() => void list.refetch()}
                tintColor={palette.primary}
                colors={[palette.primary]}
              />
            }
            ListFooterComponent={
              <ListFooter
                loadingMore={list.isFetchingNextPage}
                hasMore={Boolean(list.hasNextPage)}
                error={list.isFetchNextPageError}
                onRetry={() => void list.fetchNextPage()}
                count={items.length}
              />
            }
            renderItem={({ item: observation, index }) => (
              <ListItem
                index={index}
                title={observation.title}
                subtitle={[
                  stadiums?.find((stadium) => stadium.id === observation.stadiumId)?.code,
                  observation.disciplineName,
                ]
                  .filter(Boolean)
                  .join(' · ')}
                meta={`${observation.localDate} · ${observation.inspectorName ?? ''}`}
                trailing={
                  <View className="items-end gap-1">
                    {observation.deletedAt ? <DeletedBadge /> : null}
                    <SeverityBadge severity={observation.severity} />
                    <Badge
                      label={t(`observations.types.${observation.type}`)}
                      tone={observation.type === 'POSITIVE' ? 'success' : 'warning'}
                    />
                  </View>
                }
                onPress={() =>
                  router.push({
                    pathname: '/(admin)/hse/observations/[id]',
                    params: { id: observation.id },
                  })
                }
              />
            )}
          />
        )}
      </View>
    </Screen>
  );
}
