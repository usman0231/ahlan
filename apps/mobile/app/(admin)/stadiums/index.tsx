import { useMemo, useState } from 'react';
import { RefreshControl, useWindowDimensions, View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FlashList } from '@shopify/flash-list';
import { Building2 } from 'lucide-react-native';
import type { StadiumCardKpi } from '@ahlan/shared';

import {
  Button,
  EmptyState,
  ErrorState,
  OfflineBanner,
  Skeleton,
  Text,
  TextField,
} from '../../../src/components';
import { ListFooter } from '../../../src/components/list-footer';
import { StadiumCard, type StadiumCardStats } from '../../../src/components/stadium-card';
import { flatPages, useStadiumCards, useStadiumsPage } from '../../../src/features/admin/hooks';
import { canManage } from '../../../src/features/admin/roles';
import { useAuthStore } from '../../../src/store/auth';
import { usePalette } from '../../../src/theme/theme-provider';

/** Grid breakpoints: a phone gets one column, a wide browser up to four. */
function columnsFor(width: number): number {
  if (width >= 1500) return 4;
  if (width >= 1120) return 3;
  if (width >= 720) return 2;
  return 1;
}

const MAX_GRID = 1640;
const GAP = 16;

/** One card on the grid, whichever endpoint it came from. */
interface VenueRow {
  id: string;
  code: string;
  name: string;
  city: string | null;
  imageUrl: string | null;
  isActive: boolean;
}

/**
 * The Stadiums tab: venue photo cards with today's figures.
 *
 * An administrator sees every stadium, inactive ones included (badged), from
 * `GET /stadiums`, and can add one. A supervisor sees only the assigned venues
 * from `GET /kpis/stadium-cards`, which the API scopes - the screen never
 * filters on its own - and has no create or edit controls.
 *
 * Its own page shell rather than `Screen`: the grid is allowed wider than the
 * reading column to reach four cards across on a desktop.
 */
export default function StadiumsScreen(): React.JSX.Element {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const palette = usePalette();
  const window = useWindowDimensions();
  const role = useAuthStore((state) => state.user?.role);
  const admin = canManage(role);
  const [search, setSearch] = useState('');

  const list = useStadiumsPage(admin ? search : undefined, admin);
  const kpis = useStadiumCards();

  const kpiById = useMemo(() => {
    const map = new Map<string, StadiumCardKpi>();
    for (const row of kpis.data ?? []) map.set(row.stadiumId, row);
    return map;
  }, [kpis.data]);

  const venues: VenueRow[] = useMemo(() => {
    if (admin) {
      return flatPages(list.data).map((stadium) => ({
        id: stadium.id,
        code: stadium.code,
        name: stadium.name,
        city: stadium.city,
        imageUrl: stadium.imageUrl ?? null,
        isActive: stadium.isActive,
      }));
    }
    const needle = search.trim().toLowerCase();
    return (kpis.data ?? [])
      .map((card) => ({
        id: card.stadiumId,
        code: card.code,
        name: card.name,
        city: card.city,
        imageUrl: card.imageUrl ?? null,
        isActive: card.isActive ?? true,
      }))
      .filter(
        (venue) =>
          !needle ||
          venue.name.toLowerCase().includes(needle) ||
          venue.code.toLowerCase().includes(needle),
      );
  }, [admin, list.data, kpis.data, search]);

  const source = admin ? list : kpis;
  const loading = source.isLoading;
  const loaded = Boolean(source.data);

  const columns = columnsFor(window.width);
  const gridWidth = Math.min(window.width, MAX_GRID);
  const openNew = (): void => router.push('/(admin)/stadiums/edit');

  const header = (
    <View className="gap-4 pb-4 pt-4">
      <View className="flex-row items-end justify-between gap-3">
        <View className="flex-1 gap-1">
          <Text variant="caption" tone="muted">
            {loaded ? t('stadiums.count', { count: venues.length }) : ' '}
          </Text>
          <Text variant="display">{t('stadiums.title')}</Text>
          <Text variant="callout" tone="muted">
            {admin ? t('stadiums.adminSubtitle') : t('stadiums.supervisorSubtitle')}
          </Text>
        </View>
        {admin ? (
          <Button label={t('stadiums.new')} size="sm" fullWidth={false} onPress={openNew} />
        ) : null}
      </View>
      <View style={{ maxWidth: 480 }}>
        <TextField
          placeholder={t('stadiums.searchPlaceholder')}
          value={search}
          onChangeText={setSearch}
          autoCapitalize="none"
          returnKeyType="search"
          accessibilityLabel={t('common.search')}
        />
      </View>
    </View>
  );

  let body: React.ReactNode;
  if (source.isError && venues.length === 0) {
    body = <ErrorState error={source.error} onRetry={() => void source.refetch()} />;
  } else if (loading) {
    body = (
      <View className="flex-row flex-wrap" style={{ gap: GAP }}>
        {Array.from({ length: columns * 2 }, (_, index) => (
          <View
            key={index}
            className="overflow-hidden rounded-lg border border-card-border bg-surface"
            style={{ width: (gridWidth - 40 - GAP * (columns - 1)) / columns }}
          >
            <Skeleton height={180} rounded="xs" />
            <View className="gap-3 p-4">
              <Skeleton height={16} width="50%" />
              <Skeleton height={84} rounded="md" />
              <Skeleton height={52} rounded="md" />
            </View>
          </View>
        ))}
      </View>
    );
  } else if (venues.length === 0) {
    body = (
      <EmptyState
        title={
          search
            ? t('stadiums.noMatch')
            : admin
              ? t('stadiums.emptyTitle')
              : t('stadiums.noneAssigned')
        }
        body={search ? undefined : admin ? t('stadiums.emptyBody') : t('stadiums.noneAssignedBody')}
        icon={<Building2 size={40} color={palette.fgMuted} />}
        actionLabel={search || !admin ? undefined : t('stadiums.new')}
        onAction={search || !admin ? undefined : openNew}
      />
    );
  }

  return (
    <View className="flex-1 bg-bg" style={{ paddingTop: insets.top }}>
      <OfflineBanner />
      <View className="flex-1 self-center px-gutter" style={{ width: '100%', maxWidth: MAX_GRID }}>
        {body ? (
          <>
            {header}
            {body}
          </>
        ) : (
          <FlashList
            key={columns}
            data={venues}
            numColumns={columns}
            keyExtractor={(venue) => venue.id}
            ListHeaderComponent={header}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
            onEndReachedThreshold={0.5}
            onEndReached={() => {
              if (admin && list.hasNextPage && !list.isFetchingNextPage) void list.fetchNextPage();
            }}
            refreshControl={
              <RefreshControl
                refreshing={source.isRefetching && !list.isFetchingNextPage}
                onRefresh={() => {
                  if (admin) void list.refetch();
                  void kpis.refetch();
                }}
                tintColor={palette.primary}
                colors={[palette.primary]}
              />
            }
            ListFooterComponent={
              admin ? (
                <ListFooter
                  loadingMore={list.isFetchingNextPage}
                  hasMore={Boolean(list.hasNextPage)}
                  error={list.isFetchNextPageError}
                  onRetry={() => void list.fetchNextPage()}
                  count={venues.length}
                />
              ) : null
            }
            renderItem={({ item, index }) => (
              <View
                style={{
                  paddingBottom: GAP,
                  paddingStart: columns > 1 && index % columns !== 0 ? GAP / 2 : 0,
                  paddingEnd: columns > 1 && index % columns !== columns - 1 ? GAP / 2 : 0,
                }}
              >
                <StadiumGridItem
                  venue={item}
                  kpi={kpiById.get(item.id)}
                  kpiLoading={kpis.isLoading}
                />
              </View>
            )}
          />
        )}
      </View>
    </View>
  );
}

/**
 * One venue on the grid. Figures come from `GET /kpis/stadium-cards`:
 * today's readiness checklists done / expected, open findings, tournament
 * compliance and the assigned inspectors.
 */
function StadiumGridItem({
  venue,
  kpi,
  kpiLoading,
}: {
  venue: VenueRow;
  kpi: StadiumCardKpi | undefined;
  kpiLoading: boolean;
}): React.JSX.Element {
  const { t } = useTranslation();
  const inspectors = kpi?.assignedInspectors ?? [];

  const assignee = kpiLoading
    ? undefined
    : inspectors.length === 0
      ? null
      : inspectors.length === 1
        ? (inspectors[0]?.fullName ?? null)
        : t('stadiums.andMore', { name: inspectors[0]?.fullName, count: inspectors.length - 1 });

  const stats: StadiumCardStats | null = kpi
    ? {
        inspections: kpi.checklistsDone,
        inspectionsExpected: kpi.checklistsExpected,
        findings: kpi.findingsOpen,
        compliancePercent: kpi.compliancePercent,
        progress: kpi.progressPercent === null ? null : kpi.progressPercent / 100,
        progressLabel: t('admin.stadiumCards.progressToday'),
      }
    : kpiLoading
      ? null
      : {
          inspections: 0,
          inspectionsExpected: null,
          findings: 0,
          compliancePercent: null,
          progress: null,
          progressLabel: t('stadiums.inspectionProgress'),
        };

  return (
    <StadiumCard
      code={venue.code}
      name={venue.name}
      city={venue.city}
      imageUrl={venue.imageUrl ?? kpi?.imageUrl ?? null}
      inactive={!venue.isActive}
      assignee={assignee}
      stats={stats}
      statsLoading={kpiLoading}
      onOpen={() => router.push({ pathname: '/(admin)/stadiums/[id]', params: { id: venue.id } })}
    />
  );
}
