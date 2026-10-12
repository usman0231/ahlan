import { useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import {
  CalendarDays,
  CalendarClock,
  Clock,
  FileText,
  Lock,
  MessageSquareText,
  ShieldCheck,
  TriangleAlert,
  UserRound,
  type LucideIcon,
} from 'lucide-react-native';
import { EOD_DAILY_STAT_FIELDS, type EodDailyStatField, type EodReport } from '@ahlan/shared';

import {
  Appear,
  Button,
  Card,
  ErrorState,
  Screen,
  Skeleton,
  SkeletonText,
  Text,
  TextField,
} from '../../../src/components';
import { HeaderBar } from '../../../src/components/back-button';
import {
  FormCard,
  OperationalSummary,
  StatsGrid,
  TotalsTiles,
  WorkforceTable,
} from '../../../src/features/eod/eod-sections';
import {
  entriesToRows,
  newRowKey,
  rowTotals,
  rowsToEntries,
  sanitizeHoursInput,
  sanitizePersonnelInput,
  type WorkforceRow,
} from '../../../src/features/eod/workforce';
import {
  useCorrectEod,
  useRestoreRecord,
  useSoftDeleteRecord,
} from '../../../src/features/admin/manage-hooks';
import {
  EOD_EDIT_TEXT_FIELDS,
  eodCorrection,
  type EodEditTextField,
} from '../../../src/features/admin/record-edits';
import { useReasonDialog } from '../../../src/features/admin/components/reason-dialog';
import {
  DeletedBadge,
  DeletedNotice,
  RecordAdminActions,
} from '../../../src/features/admin/components/record-admin';
import { canManage } from '../../../src/features/admin/roles';
import { useAuthStore } from '../../../src/store/auth';
import { useAllStadiums, useEodReport } from '../../../src/features/admin/hooks';
import { REVIEW_TIMEZONE } from '../../../src/features/admin/eod-window-form';
import { usePalette } from '../../../src/theme/theme-provider';
import { formatDateTime, formatInt, formatLongDate } from '../../../src/utils/format';

const noop = (): void => undefined;

/**
 * One submitted End-of-Day report, read-only, laid out like the form the
 * inspector filled in (client mockup): report date and submission time,
 * workforce table (personnel × hours = man-hours) with totals, spectators,
 * daily HSE statistics and the operational summary.
 *
 * The table, totals and statistics are the inspector's own form components in
 * read-only mode, so the two views can never drift apart. An administrator
 * can also correct the report (the same components, editable; the API
 * recomputes totals and audits the change), soft delete it and restore it.
 */
export default function AdminEodDetailScreen(): React.JSX.Element {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const report = useEodReport(id);
  const { data: stadiums } = useAllStadiums();
  const admin = canManage(useAuthStore((state) => state.user?.role));
  const [editing, setEditing] = useState(false);
  const reason = useReasonDialog();
  const remove = useSoftDeleteRecord('eod');
  const restore = useRestoreRecord('eod');

  const header = (
    <HeaderBar backLabel={t('admin.eodList.screenTitle')} fallback="/(admin)/eod-reports" />
  );

  if (report.isError) {
    return (
      <Screen headerAction={header}>
        <ErrorState error={report.error} onRetry={() => void report.refetch()} />
      </Screen>
    );
  }

  const data = report.data;
  const timeZone =
    stadiums?.find((stadium) => stadium.id === data?.stadiumId)?.timezone ?? REVIEW_TIMEZONE;

  return (
    <Screen
      headerAction={header}
      wide
      onRefresh={() => void report.refetch()}
      contentClassName="gap-5"
    >
      {!data ? (
        <View className="gap-4">
          <Skeleton height={36} width="70%" />
          <Skeleton height={96} rounded="md" />
          <SkeletonText lines={8} />
        </View>
      ) : (
        <>
          {data.deletedAt ? (
            <DeletedNotice
              reason={data.deleteReason}
              deletedAt={data.deletedAt}
              restoring={restore.isPending}
              onRestore={
                admin
                  ? () =>
                      reason.open({
                        title: t('admin.records.restoreTitle'),
                        message: t('admin.records.restoreEod'),
                        confirmLabel: t('admin.records.restore'),
                        onConfirm: (text) => restore.mutateAsync({ id: data.id, reason: text }),
                      })
                  : undefined
              }
            />
          ) : null}
          {editing ? (
            <EodEditor report={data} openReason={reason.open} onDone={() => setEditing(false)} />
          ) : (
            <>
              <EodReportView report={data} timeZone={timeZone} />
              {admin && !data.deletedAt ? (
                <Card>
                  <RecordAdminActions
                    editLabel={t('admin.records.editEod')}
                    onEdit={() => setEditing(true)}
                    onDelete={() =>
                      reason.open({
                        title: t('admin.records.deleteTitle'),
                        message: t('admin.records.deleteEod'),
                        confirmLabel: t('admin.records.delete'),
                        destructive: true,
                        onConfirm: (text) => remove.mutateAsync({ id: data.id, reason: text }),
                      })
                    }
                  />
                </Card>
              ) : null}
            </>
          )}
        </>
      )}
      {reason.element}
    </Screen>
  );
}

function EodReportView({
  report,
  timeZone,
}: {
  report: EodReport;
  timeZone: string;
}): React.JSX.Element {
  const { t, i18n } = useTranslation();
  const palette = usePalette();

  const stats = Object.fromEntries(
    EOD_DAILY_STAT_FIELDS.map((field) => [field, String(report[field] ?? 0)]),
  ) as Record<EodDailyStatField, string>;

  return (
    <>
      <Appear index={0} className="gap-1">
        <Text variant="overline" tone="subtle">
          {t('admin.eodDetail.overline')}
        </Text>
        <Text variant="display" numberOfLines={2}>
          {report.stadiumName ?? '—'}
        </Text>
        <View className="flex-row flex-wrap items-center gap-x-4 gap-y-1 pt-1">
          <View className="flex-row items-center gap-1.5">
            <UserRound size={15} color={palette.fgMuted} />
            <Text variant="callout" tone="muted">
              {report.inspectorName ?? '—'}
            </Text>
          </View>
          {report.isLocked ? (
            <View className="flex-row items-center gap-1.5">
              <Lock size={14} color={palette.fgSubtle} />
              <Text variant="caption" tone="subtle">
                {t('admin.eodDetail.locked')}
              </Text>
            </View>
          ) : null}
          {report.deletedAt ? <DeletedBadge /> : null}
        </View>
      </Appear>

      {/* Report date + submission, side by side like the mockup */}
      <Appear index={1} className="flex-row flex-wrap gap-4">
        <View className="min-w-[240px] flex-1">
          <FormCard overline={t('admin.eodDetail.reportDate')} icon={CalendarDays}>
            <Text variant="heading" tabular>
              {report.date}
            </Text>
            <Text variant="caption" tone="muted">
              {formatLongDate(new Date(`${report.date}T12:00:00Z`), i18n.language)}
            </Text>
          </FormCard>
        </View>
        <View className="min-w-[240px] flex-1">
          <FormCard overline={t('admin.eodDetail.submission')} icon={Clock}>
            <Text variant="heading" tabular>
              {report.submittedAt
                ? formatDateTime(new Date(report.submittedAt), timeZone, i18n.language)
                : '—'}
            </Text>
            <Text variant="caption" tone="muted">
              {t('admin.eodDetail.recordedAutomatically', { zone: timeZone })}
            </Text>
          </FormCard>
        </View>
      </Appear>

      <Appear index={2} className="gap-4">
        <WorkforceTable
          rows={entriesToRows(report.workforce)}
          readOnly
          errors={{}}
          onChange={noop}
          onRemove={noop}
          onAdd={noop}
        />
        <TotalsTiles headcount={report.totalHeadcount} manHours={report.totalManHours} />
        <FormCard overline={t('admin.eodDetail.spectators')}>
          <Text variant="title" tabular>
            {report.totalSpectators === null ? '—' : formatInt(report.totalSpectators)}
          </Text>
        </FormCard>
      </Appear>

      <Appear index={3}>
        <StatsGrid values={stats} readOnly onChange={noop} />
      </Appear>

      <Appear index={4}>
        <ReadOnlySummary report={report} />
      </Appear>

      <Appear index={5}>
        <FormCard
          overline={t('admin.eodDetail.activityOverline')}
          title={t('admin.eodDetail.activityTitle')}
        >
          <View className="flex-row flex-wrap gap-3">
            <Activity label={t('kpi.inspections')} value={report.inspectionsCompleted} />
            <Activity label={t('kpi.observations')} value={report.observationsRaised} />
            <Activity label={t('admin.eodDetail.findingsRaised')} value={report.findingsRaised} />
            <Activity label={t('admin.eodDetail.findingsClosed')} value={report.findingsClosed} />
          </View>
        </FormCard>
      </Appear>
    </>
  );
}

function Activity({ label, value }: { label: string; value: number }): React.JSX.Element {
  return (
    <View className="min-w-[120px] flex-1 gap-1 rounded-md bg-surface-sunken px-3 py-3">
      <Text variant="overline" tone="subtle" numberOfLines={1}>
        {label}
      </Text>
      <Text variant="heading" tabular>
        {formatInt(value)}
      </Text>
    </View>
  );
}

const SUMMARY: { field: keyof EodReport; labelKey: string; icon: LucideIcon }[] = [
  { field: 'summary', labelKey: 'admin.eodDetail.fields.summary', icon: FileText },
  { field: 'concerns', labelKey: 'admin.eodDetail.fields.concerns', icon: TriangleAlert },
  {
    field: 'actionsMitigation',
    labelKey: 'admin.eodDetail.fields.actionsMitigation',
    icon: ShieldCheck,
  },
  {
    field: 'plannedTomorrow',
    labelKey: 'admin.eodDetail.fields.plannedTomorrow',
    icon: CalendarClock,
  },
  {
    field: 'additionalRemarks',
    labelKey: 'admin.eodDetail.fields.additionalRemarks',
    icon: MessageSquareText,
  },
];

/** The operational summary as reading text, not disabled inputs. */
function ReadOnlySummary({ report }: { report: EodReport }): React.JSX.Element {
  const { t } = useTranslation();
  const palette = usePalette();
  return (
    <FormCard
      overline={t('admin.eodDetail.summaryOverline')}
      title={t('admin.eodDetail.summaryTitle')}
    >
      {SUMMARY.map(({ field, labelKey, icon: IconComponent }) => {
        const value = report[field];
        const text = typeof value === 'string' && value.trim() ? value : null;
        return (
          <View key={field} className="gap-2 border-t border-border pt-3">
            <View className="flex-row items-center gap-2">
              <IconComponent size={17} color={palette.fgMuted} />
              <Text variant="overline" tone="muted">
                {t(labelKey)}
              </Text>
            </View>
            <Text variant="body" tone={text ? 'default' : 'subtle'}>
              {text ?? t('admin.eodDetail.notProvided')}
            </Text>
          </View>
        );
      })}
    </FormCard>
  );
}

/**
 * The administrator's correction of a submitted report: the inspector's own
 * form sections, editable. Only changed fields are sent (`eodCorrection`).
 */
function EodEditor({
  report,
  openReason,
  onDone,
}: {
  report: EodReport;
  openReason: ReturnType<typeof useReasonDialog>['open'];
  onDone: () => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const correct = useCorrectEod();
  const [rows, setRows] = useState<WorkforceRow[]>(() => entriesToRows(report.workforce));
  const [stats, setStats] = useState(
    () =>
      Object.fromEntries(
        EOD_DAILY_STAT_FIELDS.map((field) => [field, String(report[field] ?? 0)]),
      ) as Record<EodDailyStatField, string>,
  );
  const [spectators, setSpectators] = useState(
    report.totalSpectators === null ? '' : String(report.totalSpectators),
  );
  const [text, setText] = useState(
    () =>
      Object.fromEntries(
        EOD_EDIT_TEXT_FIELDS.map((field) => [field, report[field] ?? '']),
      ) as Record<EodEditTextField, string>,
  );
  const totals = rowTotals(rows);

  function save(): void {
    const body = eodCorrection(report, {
      workforce: rowsToEntries(rows),
      totalSpectators: spectators,
      stats,
      text,
    });
    if (!body) {
      onDone();
      return;
    }
    openReason({
      title: t('admin.records.saveCorrection'),
      message: t('admin.records.eodCorrectionBody'),
      confirmLabel: t('common.save'),
      onConfirm: async (reason) => {
        await correct.mutateAsync({ id: report.id, reason, ...body });
        onDone();
      },
    });
  }

  return (
    <>
      <Text variant="title">{t('admin.records.editEod')}</Text>
      <WorkforceTable
        rows={rows}
        readOnly={false}
        errors={{}}
        onChange={(key, patch) =>
          setRows((current) =>
            current.map((row) =>
              row.key === key
                ? {
                    ...row,
                    ...patch,
                    ...(patch.personnel !== undefined
                      ? { personnel: sanitizePersonnelInput(patch.personnel) }
                      : {}),
                    ...(patch.hours !== undefined
                      ? { hours: sanitizeHoursInput(patch.hours) }
                      : {}),
                  }
                : row,
            ),
          )
        }
        onRemove={(key) => setRows((current) => current.filter((row) => row.key !== key))}
        onAdd={() =>
          setRows((current) => [
            ...current,
            { key: newRowKey(), category: '', personnel: '', hours: '' },
          ])
        }
      />
      <TotalsTiles headcount={totals.totalHeadcount} manHours={totals.totalManHours} />
      <FormCard overline={t('admin.eodDetail.spectators')}>
        <TextField
          value={spectators}
          onChangeText={(value) => setSpectators(value.replace(/\D/g, '').slice(0, 7))}
          keyboardType="number-pad"
          accessibilityLabel={t('admin.eodDetail.spectators')}
        />
      </FormCard>
      <StatsGrid
        values={stats}
        readOnly={false}
        onChange={(field, value) =>
          setStats((current) => ({ ...current, [field]: value.replace(/\D/g, '').slice(0, 4) }))
        }
      />
      <OperationalSummary
        values={text}
        readOnly={false}
        errors={{}}
        onChange={(field, value) => setText((current) => ({ ...current, [field]: value }))}
      />
      <View className="flex-row gap-3">
        <View className="flex-1">
          <Button label={t('common.cancel')} variant="secondary" onPress={onDone} />
        </View>
        <View className="flex-1">
          <Button label={t('common.save')} loading={correct.isPending} onPress={save} />
        </View>
      </View>
    </>
  );
}
