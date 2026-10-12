import { useState } from 'react';
import { RefreshControl, View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { FlashList } from '@shopify/flash-list';
import { FINDING_STATUSES, SEVERITIES } from '@ahlan/shared';
import type { FindingStatus, Severity } from '@ahlan/shared';

import {
  Chip,
  ChipRow,
  EmptyState,
  ErrorState,
  ListItem,
  Screen,
  SeverityBadge,
  SkeletonList,
  StatusBadge,
  Text,
} from '../../../src/components';
import { Icon } from '../../../src/components/icon';
import { ListFooter } from '../../../src/components/list-footer';
import { flatPages, useAllStadiums, useFindingsList } from '../../../src/features/admin/hooks';
import { usePalette } from '../../../src/theme/theme-provider';
import { canManage } from '../../../src/features/admin/roles';
import { useAuthStore } from '../../../src/store/auth';
import { DeletedBadge, ShowDeletedChip } from '../../../src/features/admin/components/record-admin';

/**
 * Findings across the reviewer's stadiums (all of them for an administrator).
 *
 * Read from the API rather than the local database: a reviewer is looking at
 * the whole tournament, which is more than a phone should cache. Every filter
 * is applied by the server and the list pages by cursor as it scrolls, so a
 * filter never quietly hides rows beyond the first page.
 */
export default function AdminFindingsScreen(): React.JSX.Element {
  const { t } = useTranslation();
  const palette = usePalette();
  const [status, setStatus] = useState<FindingStatus | null>(null);
  const [stadiumId, setStadiumId] = useState<string | null>(null);
  const [severity, setSeverity] = useState<Severity | null>(null);
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [includeDeleted, setIncludeDeleted] = useState(false);
  const admin = canManage(useAuthStore((state) => state.user?.role));

  const { data: stadiums } = useAllStadiums();
  const findings = useFindingsList({
    status,
    stadiumId,
    severity,
    overdueOnly,
    includeDeleted: admin && includeDeleted,
  });
  const items = flatPages(findings.data);
  const filtered = Boolean(status || stadiumId || severity || overdueOnly);

  return (
    <Screen
      title={t('findings.title')}
      subtitle={findings.data ? t('admin.review.shown', { count: items.length }) : undefined}
      scroll={false}
    >
      <View className="gap-2 pb-4">
        <ChipRow
          options={FINDING_STATUSES.map((value) => ({
            value,
            label: t(`findings.statuses.${value}`),
          }))}
          value={status}
          onChange={(value) => setStatus(value as FindingStatus | null)}
        />
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
          options={SEVERITIES.map((value) => ({
            value,
            label: t(`findings.severities.${value}`),
          }))}
          value={severity}
          onChange={(value) => setSeverity(value as Severity | null)}
        />
        <View className="flex-row gap-2 px-gutter">
          <Chip
            label={t('findings.filterOverdue')}
            selected={overdueOnly}
            onPress={() => setOverdueOnly((value) => !value)}
          />
          {admin ? <ShowDeletedChip value={includeDeleted} onChange={setIncludeDeleted} /> : null}
        </View>
      </View>

      <View className="flex-1 px-gutter">
        {findings.isError && items.length === 0 ? (
          <ErrorState error={findings.error} onRetry={() => void findings.refetch()} />
        ) : findings.isLoading ? (
          <SkeletonList count={6} />
        ) : items.length === 0 ? (
          <EmptyState
            title={filtered ? t('admin.review.noMatch') : t('findings.emptyTitle')}
            body={filtered ? undefined : t('findings.emptyBody')}
            icon={<Icon name="findings" size={40} tone="muted" />}
          />
        ) : (
          <FlashList
            data={items}
            keyExtractor={(finding) => finding.id}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 24 }}
            ItemSeparatorComponent={() => <View className="h-3" />}
            onEndReachedThreshold={0.5}
            onEndReached={() => {
              if (findings.hasNextPage && !findings.isFetchingNextPage)
                void findings.fetchNextPage();
            }}
            refreshControl={
              <RefreshControl
                refreshing={findings.isRefetching && !findings.isFetchingNextPage}
                onRefresh={() => void findings.refetch()}
                tintColor={palette.primary}
                colors={[palette.primary]}
              />
            }
            ListFooterComponent={
              <ListFooter
                loadingMore={findings.isFetchingNextPage}
                hasMore={Boolean(findings.hasNextPage)}
                error={findings.isFetchNextPageError}
                onRetry={() => void findings.fetchNextPage()}
                count={items.length}
              />
            }
            renderItem={({ item: finding, index }) => {
              const action = finding.actions[0];
              return (
                <ListItem
                  index={index}
                  title={finding.title}
                  subtitle={finding.stadiumName ?? undefined}
                  meta={`${finding.reference} · ${finding.raisedByName ?? ''}`}
                  trailing={
                    <View className="items-end gap-1">
                      {finding.deletedAt ? <DeletedBadge /> : null}
                      <SeverityBadge severity={finding.severity} />
                      <StatusBadge status={finding.status} isOverdue={finding.isOverdue} />
                      {action?.dueDate ? (
                        <Text variant="caption" tone={finding.isOverdue ? 'danger' : 'subtle'}>
                          {action.dueDate}
                        </Text>
                      ) : null}
                    </View>
                  }
                  onPress={() =>
                    router.push({
                      pathname: '/(admin)/review-findings/[id]',
                      params: { id: finding.id },
                    })
                  }
                />
              );
            }}
          />
        )}
      </View>
    </Screen>
  );
}
