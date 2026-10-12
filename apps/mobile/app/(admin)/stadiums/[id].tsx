import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Trash2 } from 'lucide-react-native';
import type { FindingStatus } from '@ahlan/shared';

import {
  Appear,
  Avatar,
  Button,
  Card,
  DetailRow,
  Divider,
  ErrorState,
  KpiCard,
  ListItem,
  Screen,
  Section,
  SeverityBadge,
  SkeletonKpiGrid,
  SkeletonList,
  SkeletonText,
  StatusBadge,
  Text,
} from '../../../src/components';
import { HeaderBar } from '../../../src/components/back-button';
import { RoleBadge } from '../../../src/components/role-badge';
import { StadiumPhotoHeader } from '../../../src/components/stadium-card';
import { ProgressBar } from '../../../src/components/progress-bar';
import {
  useDashboard,
  useRecentFindings,
  useRecentInspections,
  useStadium,
  useStadiumAssignees,
  useStadiumCards,
  useUpdateStadium,
} from '../../../src/features/admin/hooks';
import { useDeleteStadium } from '../../../src/features/admin/manage-hooks';
import { useReasonDialog } from '../../../src/features/admin/components/reason-dialog';
import { StadiumPhotoPanel } from '../../../src/features/admin/components/stadium-photo-panel';
import { canManage } from '../../../src/features/admin/roles';
import { useAuthStore } from '../../../src/store/auth';
import { usePalette } from '../../../src/theme/theme-provider';
import { confirmDialog } from '../../../src/utils/dialogs';
import { formatInt, formatPercent } from '../../../src/utils/format';

/**
 * One venue: its figures, who covers it, and what happened there lately.
 *
 * An administrator also manages it here - photo upload / replace / remove,
 * edit, activate / deactivate and delete (soft, with an audited reason). A
 * supervisor gets the same page read-only, and only for an assigned stadium
 * (the API answers 403 for any other).
 */
export default function StadiumDetailScreen(): React.JSX.Element {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const palette = usePalette();
  const role = useAuthStore((state) => state.user?.role);
  const admin = canManage(role);

  const stadium = useStadium(id);
  const dashboard = useDashboard({ stadiumId: id, compare: true });
  const assignees = useStadiumAssignees(id);
  const inspections = useRecentInspections(id);
  const findings = useRecentFindings(id);
  const update = useUpdateStadium();
  const remove = useDeleteStadium();
  const reason = useReasonDialog();
  const cards = useStadiumCards();
  const card = cards.data?.find((row) => row.stadiumId === id);

  const header = (
    <HeaderBar backLabel={t('stadiums.title')} fallback="/(admin)/stadiums">
      {admin && stadium.data ? (
        <Button
          label={t('common.edit')}
          variant="secondary"
          size="sm"
          fullWidth={false}
          onPress={() =>
            router.push({ pathname: '/(admin)/stadiums/edit', params: { id: stadium.data.id } })
          }
        />
      ) : null}
    </HeaderBar>
  );

  if (stadium.isError) {
    return (
      <Screen headerAction={header}>
        <ErrorState error={stadium.error} onRetry={() => void stadium.refetch()} />
      </Screen>
    );
  }

  const venue = stadium.data;
  const summary = dashboard.data?.summary;

  function toggleActive(): void {
    if (!venue) return;
    const next = !venue.isActive;
    confirmDialog({
      title: next ? t('stadiums.activate') : t('stadiums.deactivate'),
      message: next ? venue.name : t('stadiums.deactivateBody', { name: venue.name }),
      confirmLabel: next ? t('stadiums.activate') : t('stadiums.deactivate'),
      cancelLabel: t('common.cancel'),
      destructive: !next,
      onConfirm: () => update.mutate({ id: venue.id, isActive: next }),
    });
  }

  function confirmDelete(): void {
    if (!venue) return;
    reason.open({
      title: t('stadiums.deleteTitle'),
      message: t('stadiums.deleteBody', { name: venue.name }),
      confirmLabel: t('common.delete'),
      destructive: true,
      onConfirm: async (text) => {
        await remove.mutateAsync({ id: venue.id, reason: text });
        router.replace('/(admin)/stadiums');
      },
    });
  }

  return (
    <Screen
      headerAction={header}
      wide
      onRefresh={() => {
        void stadium.refetch();
        void dashboard.refetch();
        void assignees.refetch();
        void inspections.refetch();
        void findings.refetch();
        void cards.refetch();
      }}
      contentClassName="gap-6"
    >
      {venue ? (
        <Appear index={0}>
          <StadiumPhotoHeader
            code={venue.code}
            name={venue.name}
            city={venue.city}
            imageUrl={venue.imageUrl}
            inactive={!venue.isActive}
            height={220}
            rounded="all"
          />
        </Appear>
      ) : (
        <SkeletonText lines={6} />
      )}

      {/* Today: readiness checklists done / expected, per the stadium card */}
      {card ? (
        <Appear index={1}>
          <Section title={t('admin.stadiumCards.today', { date: card.date })}>
            <Card className="gap-3">
              <View className="flex-row items-end justify-between gap-3">
                <View className="flex-1 gap-0.5">
                  <Text variant="overline" tone="subtle">
                    {t('admin.stadiumCards.progressToday')}
                  </Text>
                  <Text variant="title" tabular>
                    {card.checklistsDone}/{card.checklistsExpected}
                  </Text>
                </View>
                <View className="items-end gap-0.5">
                  <Text variant="overline" tone="subtle">
                    {t('admin.stadiumCards.openFindings')}
                  </Text>
                  <Text
                    variant="title"
                    tone={card.findingsOpen > 0 ? 'warning' : 'default'}
                    tabular
                  >
                    {formatInt(card.findingsOpen)}
                  </Text>
                </View>
              </View>
              <ProgressBar value={(card.progressPercent ?? 0) / 100} />
              <Button
                label={t('admin.stadiumCards.viewCompletion')}
                variant="secondary"
                size="sm"
                onPress={() => router.push('/(admin)/checklists')}
              />
            </Card>
          </Section>
        </Appear>
      ) : cards.isLoading ? (
        <SkeletonText lines={3} />
      ) : null}

      {/* Figures, tournament to date */}
      <Section title={t('stadiums.figures')}>
        {dashboard.isLoading ? (
          <SkeletonKpiGrid count={4} />
        ) : summary ? (
          <Appear index={1} className="flex-row flex-wrap gap-3">
            <KpiCard
              label={t('kpi.compliance')}
              value={formatPercent(summary.compliancePercent, '—')}
            />
            <KpiCard label={t('kpi.inspections')} value={formatInt(summary.inspections)} />
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
            <KpiCard label={t('kpi.observations')} value={formatInt(summary.observations)} />
            <KpiCard
              label={t('eod.compliance')}
              value={`${summary.eodSubmitted}/${summary.eodExpected}`}
            />
          </Appear>
        ) : dashboard.isError ? (
          <ErrorState error={dashboard.error} onRetry={() => void dashboard.refetch()} />
        ) : null}
      </Section>

      {admin && venue ? (
        <Section title={t('stadiums.photo.section')}>
          <StadiumPhotoPanel stadium={venue} />
        </Section>
      ) : null}

      {venue ? (
        <Section title={t('stadiums.details')}>
          <Card padded={false} className="px-4 py-2">
            <DetailRow label={t('stadiums.code')} value={venue.code} />
            <Divider />
            <DetailRow label={t('stadiums.nameAr')} value={venue.nameAr} />
            <Divider />
            <DetailRow label={t('stadiums.city')} value={venue.city} />
            <Divider />
            <DetailRow label={t('stadiums.timezone')} value={venue.timezone} />
            <Divider />
            <DetailRow
              label={t('stadiums.capacity')}
              value={venue.capacity !== null ? formatInt(venue.capacity) : null}
            />
            <Divider />
            <DetailRow
              label={t('stadiums.status')}
              value={venue.isActive ? t('stadiums.active') : t('stadiums.inactive')}
            />
          </Card>
        </Section>
      ) : null}

      {/* Who covers it */}
      <Section title={t('stadiums.assignedUsers')}>
        {assignees.isLoading ? (
          <SkeletonList count={2} />
        ) : (assignees.data ?? []).length === 0 ? (
          <Card>
            <Text variant="callout" tone="muted">
              {t('stadiums.noAssignees')}
            </Text>
          </Card>
        ) : (
          <View className="gap-3">
            {(assignees.data ?? []).map((user, index) => (
              <ListItem
                key={user.id}
                index={index}
                leading={<Avatar name={user.fullName} />}
                title={user.fullName}
                subtitle={user.email}
                trailing={<RoleBadge role={user.role} />}
                onPress={
                  admin
                    ? () =>
                        router.push({
                          pathname: '/(admin)/manage/users/[id]',
                          params: { id: user.id },
                        })
                    : undefined
                }
              />
            ))}
          </View>
        )}
      </Section>

      <Section title={t('stadiums.recentInspections')}>
        {inspections.isLoading ? (
          <SkeletonList count={3} />
        ) : (inspections.data?.items ?? []).length === 0 ? (
          <Card>
            <Text variant="callout" tone="muted">
              {t('inspections.emptyTitle')}
            </Text>
          </Card>
        ) : (
          <View className="gap-3">
            {(inspections.data?.items ?? []).map((inspection) => (
              <ListItem
                key={inspection.id}
                title={inspection.checklistTitle}
                subtitle={inspection.inspectorName}
                meta={inspection.localDate}
                trailing={
                  <Text variant="heading" tabular>
                    {formatPercent(inspection.compliancePercent, '—')}
                  </Text>
                }
                onPress={() =>
                  router.push({
                    pathname: '/(admin)/checklists/inspection/[id]',
                    params: { id: inspection.id },
                  })
                }
              />
            ))}
          </View>
        )}
      </Section>

      <Section title={t('stadiums.recentFindings')}>
        {findings.isLoading ? (
          <SkeletonList count={3} />
        ) : (findings.data?.items ?? []).length === 0 ? (
          <Card>
            <Text variant="callout" tone="muted">
              {t('findings.emptyTitle')}
            </Text>
          </Card>
        ) : (
          <View className="gap-3">
            {(findings.data?.items ?? []).map((finding) => (
              <ListItem
                key={finding.id}
                title={finding.title}
                meta={`${finding.reference} · ${finding.localDate}`}
                trailing={
                  <View className="items-end gap-1">
                    <SeverityBadge severity={finding.severity} />
                    <StatusBadge
                      status={finding.status as FindingStatus}
                      isOverdue={finding.isOverdue}
                    />
                  </View>
                }
                onPress={() =>
                  router.push({
                    pathname: '/(admin)/review-findings/[id]',
                    params: { id: finding.id },
                  })
                }
              />
            ))}
          </View>
        )}
      </Section>

      {admin && venue ? (
        <Section title={t('stadiums.manageSection')}>
          <Card className="gap-3">
            <Button
              label={venue.isActive ? t('stadiums.deactivate') : t('stadiums.activate')}
              variant="secondary"
              loading={update.isPending}
              onPress={toggleActive}
            />
            <Button
              label={t('stadiums.delete')}
              variant="ghost"
              icon={<Trash2 size={18} color={palette.danger} />}
              onPress={confirmDelete}
            />
            <Text variant="caption" tone="muted">
              {t('stadiums.deleteHint')}
            </Text>
          </Card>
        </Section>
      ) : null}
      {reason.element}
    </Screen>
  );
}
