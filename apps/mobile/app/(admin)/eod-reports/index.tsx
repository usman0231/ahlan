import { useMemo, useState } from 'react';
import { Pressable, RefreshControl, View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { FlashList } from '@shopify/flash-list';
import { CalendarCheck, Clock, UserRound, Users } from 'lucide-react-native';
import { zonedDateString, type EodReport } from '@ahlan/shared';

import {
  Card,
  ChipRow,
  EmptyState,
  ErrorState,
  Screen,
  SegmentedControl,
  Skeleton,
  SkeletonList,
  Text,
} from '../../../src/components';
import { ListFooter } from '../../../src/components/list-footer';
import { ProgressBar } from '../../../src/components/progress-bar';
import { EodWindowCard } from '../../../src/features/admin/components/eod-window-card';
import {
  flatPages,
  useAllStadiums,
  useEodCompliance,
  useEodReports,
} from '../../../src/features/admin/hooks';
import { canManage } from '../../../src/features/admin/roles';
import {
  eodRangeFor,
  REVIEW_TIMEZONE,
  type EodRangePreset,
} from '../../../src/features/admin/eod-window-form';
import { useAuthStore } from '../../../src/store/auth';
import { DeletedBadge, ShowDeletedChip } from '../../../src/features/admin/components/record-admin';
import { usePalette } from '../../../src/theme/theme-provider';
import { fonts } from '../../../src/theme/tokens';
import { formatDateTime, formatDecimal, formatInt } from '../../../src/utils/format';

/**
 * End-of-Day reports (client mockup "Admin … END of the report"): the
 * submission window an administrator controls, today's chase-up list, and
 * every submitted report, newest first, paged as it scrolls.
 *
 * A supervisor sees the same screen without the window settings, limited to
 * their stadiums by the API.
 */
export default function AdminEodScreen(): React.JSX.Element {
  const { t } = useTranslation();
  const palette = usePalette();
  const role = useAuthStore((state) => state.user?.role);
  const admin = canManage(role);

  const today = zonedDateString(new Date(), REVIEW_TIMEZONE);
  const [range, setRange] = useState<EodRangePreset>('30');
  const [stadiumId, setStadiumId] = useState<string | null>(null);
  const [includeDeleted, setIncludeDeleted] = useState(false);
  const { data: stadiums } = useAllStadiums();
  const zoneFor = useMemo(() => {
    const map = new Map((stadiums ?? []).map((stadium) => [stadium.id, stadium.timezone]));
    return (id: string) => map.get(id) ?? REVIEW_TIMEZONE;
  }, [stadiums]);

  const reports = useEodReports({
    stadiumId,
    ...eodRangeFor(range, today),
    includeDeleted: admin && includeDeleted,
  });
  const items = flatPages(reports.data);
  const filtered = Boolean(stadiumId) || range !== 'all';

  const header = (
    <View className="gap-5 pb-4">
      {admin ? <EodWindowCard /> : null}
      <TodayCompliance date={today} />

      <View className="gap-1 pt-2">
        <Text variant="title">{t('admin.eodList.title')}</Text>
        <Text variant="caption" tone="muted">
          {t('admin.eodList.subtitle')}
        </Text>
      </View>
      <SegmentedControl
        options={[
          { value: 'today', label: t('common.today') },
          { value: '7', label: t('admin.eodList.days', { count: 7 }) },
          { value: '30', label: t('admin.eodList.days', { count: 30 }) },
          { value: 'all', label: t('common.all') },
        ]}
        value={range}
        onChange={(value) => setRange(value as EodRangePreset)}
      />
      {(stadiums ?? []).length > 1 ? (
        <ChipRow
          className="-mx-gutter"
          options={(stadiums ?? []).map((stadium) => ({ value: stadium.id, label: stadium.code }))}
          value={stadiumId}
          onChange={setStadiumId}
        />
      ) : null}
      {admin ? (
        <View className="flex-row">
          <ShowDeletedChip value={includeDeleted} onChange={setIncludeDeleted} />
        </View>
      ) : null}
    </View>
  );

  let body: React.ReactNode = null;
  if (reports.isError && items.length === 0) {
    body = <ErrorState error={reports.error} onRetry={() => void reports.refetch()} />;
  } else if (reports.isLoading) {
    body = <SkeletonList count={5} />;
  } else if (items.length === 0) {
    body = (
      <Card>
        <EmptyState
          title={filtered ? t('admin.eodList.noMatch') : t('admin.eodList.emptyTitle')}
          body={filtered ? undefined : t('admin.eodList.emptyBody')}
          icon={<CalendarCheck size={40} color={palette.fgMuted} />}
        />
      </Card>
    );
  }

  return (
    <Screen
      title={t('admin.eodList.screenTitle')}
      subtitle={
        admin ? t('admin.eodList.screenSubtitle') : t('admin.eodList.screenSubtitleSupervisor')
      }
      scroll={false}
      wide
    >
      <FlashList
        data={body ? [] : items}
        keyExtractor={(report) => report.id}
        ListHeaderComponent={
          <>
            {header}
            {body}
          </>
        }
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 32 }}
        ItemSeparatorComponent={() => <View className="h-3" />}
        onEndReachedThreshold={0.5}
        onEndReached={() => {
          if (reports.hasNextPage && !reports.isFetchingNextPage) void reports.fetchNextPage();
        }}
        refreshControl={
          <RefreshControl
            refreshing={reports.isRefetching && !reports.isFetchingNextPage}
            onRefresh={() => void reports.refetch()}
            tintColor={palette.primary}
            colors={[palette.primary]}
          />
        }
        ListFooterComponent={
          body ? null : (
            <ListFooter
              loadingMore={reports.isFetchingNextPage}
              hasMore={Boolean(reports.hasNextPage)}
              error={reports.isFetchNextPageError}
              onRetry={() => void reports.fetchNextPage()}
              count={items.length}
            />
          )
        }
        renderItem={({ item }) => <EodRow report={item} timeZone={zoneFor(item.stadiumId)} />}
      />
    </Screen>
  );
}

function EodRow({ report, timeZone }: { report: EodReport; timeZone: string }): React.JSX.Element {
  const { t, i18n } = useTranslation();
  const palette = usePalette();
  return (
    <Card padded={false}>
      <PressableRow
        onPress={() =>
          router.push({ pathname: '/(admin)/eod-reports/[id]', params: { id: report.id } })
        }
        label={`${report.stadiumName ?? ''}, ${report.date}, ${report.inspectorName ?? ''}`}
      >
        <View className="flex-row items-start justify-between gap-3">
          <View className="flex-1 gap-1">
            <Text variant="heading" numberOfLines={2}>
              {report.stadiumName ?? '—'}
            </Text>
            <View className="flex-row items-center gap-1.5">
              <UserRound size={14} color={palette.fgMuted} />
              <Text variant="caption" tone="muted" numberOfLines={1}>
                {report.inspectorName ?? '—'}
              </Text>
            </View>
          </View>
          <View className="items-end gap-1">
            {report.deletedAt ? <DeletedBadge /> : null}
            <Text variant="callout" tabular style={{ fontFamily: fonts.semibold }}>
              {report.date}
            </Text>
            {report.submittedAt ? (
              <View className="flex-row items-center gap-1">
                <Clock size={12} color={palette.fgSubtle} />
                <Text variant="caption" tone="subtle" tabular>
                  {formatDateTime(new Date(report.submittedAt), timeZone, i18n.language)}
                </Text>
              </View>
            ) : null}
          </View>
        </View>
        <View className="flex-row gap-2">
          <Figure
            icon={<Users size={16} color={palette.info} />}
            label={t('admin.eodList.workforce')}
            value={formatInt(report.totalHeadcount)}
            tone="info"
          />
          <Figure
            label={t('admin.eodList.manHours')}
            value={formatDecimal(report.totalManHours)}
            tone="success"
          />
        </View>
      </PressableRow>
    </Card>
  );
}

function Figure({
  icon,
  label,
  value,
  tone,
}: {
  icon?: React.ReactNode;
  label: string;
  value: string;
  tone: 'info' | 'success';
}): React.JSX.Element {
  return (
    <View
      className={`flex-1 flex-row items-center gap-2 rounded-md px-3 py-2.5 ${tone === 'info' ? 'bg-info-soft' : 'bg-success-soft'}`}
    >
      {icon}
      <View className="flex-1">
        <Text variant="overline" className={tone === 'info' ? 'text-info' : 'text-success'}>
          {label}
        </Text>
        <Text variant="heading" tabular className={tone === 'info' ? 'text-info' : 'text-success'}>
          {value}
        </Text>
      </View>
    </View>
  );
}

function PressableRow({
  onPress,
  label,
  children,
}: {
  onPress: () => void;
  label: string;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      className="gap-3 rounded-lg p-4 active:bg-surface-sunken"
    >
      {children}
    </Pressable>
  );
}

/** Who has submitted today's EOD and who has not (inspectors only). */
function TodayCompliance({ date }: { date: string }): React.JSX.Element | null {
  const { t } = useTranslation();
  const compliance = useEodCompliance(date);
  const rows = compliance.data ?? [];

  if (compliance.isError) return null;
  if (compliance.isLoading) {
    return (
      <Card className="gap-3">
        <Skeleton height={18} width="50%" />
        <Skeleton height={10} rounded="full" />
      </Card>
    );
  }
  if (rows.length === 0) return null;

  const submitted = rows.filter((row) => row.submitted).length;
  const missing = rows.filter((row) => !row.submitted);

  return (
    <Card className="gap-3">
      <View className="flex-row items-center justify-between gap-3">
        <Text variant="heading" className="flex-1">
          {t('admin.eodCompliance.title')}
        </Text>
        <Text variant="heading" tabular>
          {submitted}/{rows.length}
        </Text>
      </View>
      <ProgressBar value={rows.length ? submitted / rows.length : 0} />
      {missing.length === 0 ? (
        <Text variant="caption" tone="success">
          {t('admin.eodCompliance.allIn')}
        </Text>
      ) : (
        <View className="gap-2">
          <Text variant="overline" tone="subtle">
            {t('admin.eodCompliance.missing', { count: missing.length })}
          </Text>
          <View className="flex-row flex-wrap gap-2">
            {missing.map((row) => (
              <View
                key={`${row.stadiumId}:${row.inspectorId}`}
                className="max-w-full rounded-full bg-warning-soft px-3 py-1.5"
              >
                <Text variant="caption" className="text-warning" numberOfLines={1}>
                  {row.inspectorName} · {row.stadiumName}
                </Text>
              </View>
            ))}
          </View>
        </View>
      )}
    </Card>
  );
}
