import { useState } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { REPORT_TYPES, type ReportScope, type ReportType } from '@ahlan/shared';

import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Field,
  InlineError,
  ListItem,
  OptionList,
  Screen,
  Section,
  SegmentedControl,
  SkeletonList,
  Text,
  ToggleRow,
} from '../../src/components';
import { Icon } from '../../src/components/icon';
import {
  flatPages,
  useAllStadiums,
  useReports,
  useRequestReport,
} from '../../src/features/admin/hooks';
import { canRequestConsolidatedReport } from '../../src/features/admin/roles';
import { useAuthStore } from '../../src/store/auth';
import { ListFooter } from '../../src/components/list-footer';
import { ApiError } from '../../src/api/client';
import { formatBytes } from '../../src/utils/format';
import { openReportPdf } from '../../src/features/admin/report-download';
import { Trash2 } from 'lucide-react-native';
import { IconButton } from '../../src/components';
import { canManage } from '../../src/features/admin/roles';
import { useDeleteReport } from '../../src/features/admin/manage-hooks';
import { useReasonDialog } from '../../src/features/admin/components/reason-dialog';
import { usePalette } from '../../src/theme/theme-provider';

/**
 * Requesting and downloading reports.
 *
 * Generation happens in a worker, so this screen is built around waiting: a
 * requested report appears immediately as QUEUED and the list polls until it is
 * ready. The download link is presigned on read, which is why it is fetched
 * fresh rather than stored.
 */
export default function ReportsScreen(): React.JSX.Element {
  const { t } = useTranslation();
  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
    isFetchNextPageError,
  } = useReports();
  // A supervisor's picker holds only their assigned stadiums, and they may
  // only request single-stadium reports (the API enforces both).
  const { data: stadiums } = useAllStadiums();
  const role = useAuthStore((state) => state.user?.role);
  const consolidatedAllowed = canRequestConsolidatedReport(role);
  const admin = canManage(role);
  const palette = usePalette();
  const removeReport = useDeleteReport();
  const reason = useReasonDialog();
  const request = useRequestReport();

  const [type, setType] = useState<ReportType>('WEEKLY');
  const [scopeChoice, setScope] = useState<ReportScope>('CONSOLIDATED');
  const scope: ReportScope = consolidatedAllowed ? scopeChoice : 'STADIUM';
  const [stadiumId, setStadiumId] = useState<string | null>(null);
  const [includeAi, setIncludeAi] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const download = async (reportId: string): Promise<void> => {
    setDownloadError(null);
    setDownloading(reportId);
    try {
      await openReportPdf(reportId);
    } catch {
      setDownloadError(t('admin.downloadFailed'));
    } finally {
      setDownloading(null);
    }
  };

  function submit(): void {
    setFormError(null);
    if (scope === 'STADIUM' && !stadiumId) {
      setFormError(t('errors.VALIDATION_FAILED'));
      return;
    }

    request.mutate(
      {
        type,
        scope,
        stadiumId: scope === 'STADIUM' ? stadiumId : null,
        includeAiInsights: includeAi,
        locale: 'en',
      },
      {
        onError: (mutationError) =>
          setFormError(
            mutationError instanceof ApiError
              ? t(mutationError.translationKey, { defaultValue: t('errors.UNKNOWN') })
              : t('errors.UNKNOWN'),
          ),
      },
    );
  }

  if (isError) {
    return (
      <Screen title={t('admin.reports')}>
        <ErrorState error={error} onRetry={() => void refetch()} />
      </Screen>
    );
  }

  const reports = flatPages(data);

  return (
    <Screen title={t('admin.reports')} onRefresh={() => void refetch()} contentClassName="gap-6">
      <Section title={t('admin.requestReport')}>
        <Card className="gap-4">
          <Field label={t('admin.reportType')}>
            <OptionList
              options={REPORT_TYPES.map((value) => ({
                value,
                label: t(`admin.reportTypes.${value}`),
              }))}
              value={type}
              onChange={(value) => setType(value as ReportType)}
            />
          </Field>

          {consolidatedAllowed ? (
            <Field label={t('admin.reportScope')}>
              <SegmentedControl
                options={[
                  { value: 'CONSOLIDATED', label: t('admin.scopes.CONSOLIDATED') },
                  { value: 'STADIUM', label: t('admin.scopes.STADIUM') },
                ]}
                value={scope}
                onChange={(value) => setScope(value as ReportScope)}
              />
            </Field>
          ) : null}

          {scope === 'STADIUM' ? (
            <Field label={t('admin.stadiums')}>
              <OptionList
                options={(stadiums ?? []).map((stadium) => ({
                  value: stadium.id,
                  label: stadium.name,
                  description: stadium.code,
                }))}
                value={stadiumId}
                onChange={setStadiumId}
              />
            </Field>
          ) : null}

          <Card padded={false}>
            <ToggleRow
              label={t('admin.includeAi')}
              description={t('admin.aiReviewNote')}
              value={includeAi}
              onChange={setIncludeAi}
            />
          </Card>

          {formError ? <InlineError message={formError} /> : null}

          <Button label={t('admin.requestReport')} loading={request.isPending} onPress={submit} />
        </Card>
      </Section>

      <Section title={t('admin.reports')}>
        {isLoading ? (
          <SkeletonList count={4} />
        ) : reports.length === 0 ? (
          <EmptyState
            title={t('states.emptyTitle')}
            body={t('states.emptyBody')}
            icon={<Icon name="reports" size={40} tone="muted" />}
          />
        ) : (
          <View className="gap-3">
            {downloadError ? <InlineError message={downloadError} /> : null}
            {reports.map((report) => (
              <ListItem
                key={report.id}
                title={t(`admin.reportTypes.${report.type}`)}
                subtitle={`${report.periodStart} → ${report.periodEnd}`}
                meta={[
                  report.stadiumName ?? t('admin.scopes.CONSOLIDATED'),
                  report.sizeBytes ? formatBytes(report.sizeBytes) : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
                trailing={
                  <View className="items-end gap-2">
                    <Badge
                      label={
                        report.status === 'COMPLETED'
                          ? downloading === report.id
                            ? t('admin.opening')
                            : t('admin.download')
                          : report.status === 'FAILED'
                            ? t('admin.failed')
                            : report.status === 'RUNNING'
                              ? t('admin.generating')
                              : t('admin.queued')
                      }
                      tone={
                        report.status === 'COMPLETED'
                          ? 'success'
                          : report.status === 'FAILED'
                            ? 'danger'
                            : 'info'
                      }
                    />
                    {report.includeAiInsights ? (
                      <Badge label={t('admin.aiGenerated')} tone="primary" />
                    ) : null}
                  </View>
                }
                action={
                  admin && report.status !== 'RUNNING' ? (
                    <IconButton
                      icon={<Trash2 size={18} color={palette.danger} />}
                      accessibilityLabel={t('admin.reportDelete.action')}
                      onPress={() =>
                        reason.open({
                          title: t('admin.reportDelete.title'),
                          message: t('admin.reportDelete.body'),
                          confirmLabel: t('common.delete'),
                          destructive: true,
                          onConfirm: (text) =>
                            removeReport.mutateAsync({ id: report.id, reason: text }),
                        })
                      }
                    />
                  ) : undefined
                }
                onPress={report.status === 'COMPLETED' ? () => void download(report.id) : undefined}
              />
            ))}
          </View>
        )}

        <ListFooter
          loadingMore={isFetchingNextPage}
          hasMore={Boolean(hasNextPage)}
          error={isFetchNextPageError}
          onRetry={() => void fetchNextPage()}
          count={reports.length}
        />
        {hasNextPage && !isFetchingNextPage ? (
          <Button
            label={t('admin.loadMore')}
            variant="ghost"
            onPress={() => void fetchNextPage()}
          />
        ) : null}

        {reports.some((report) => report.error) ? (
          <Text variant="caption" tone="danger">
            {reports.find((report) => report.error)?.error}
          </Text>
        ) : null}
      </Section>
      {reason.element}
    </Screen>
  );
}
