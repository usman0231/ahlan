import { useEffect, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { CalendarDays, Clock, Send } from 'lucide-react-native';
import { addDays, type EodDailyStatField } from '@ahlan/shared';

import {
  Button,
  EmptyState,
  InlineError,
  OptionList,
  Screen,
  SegmentedControl,
  Skeleton,
  SyncBadge,
  Text,
  TextField,
} from '../../src/components';
import { useStadiums } from '../../src/features/catalog/hooks';
import { useEod } from '../../src/features/eod/use-eod';
import {
  emptyEodForm,
  sanitizeCountInput,
  validateEodForm,
  type EodFieldErrors,
  type EodFormValues,
  type EodTextField,
} from '../../src/features/eod/eod-form';
import { newRowKey, rowTotals, type WorkforceRow } from '../../src/features/eod/workforce';
import {
  FormCard,
  OperationalSummary,
  StatsGrid,
  TotalsTiles,
  WorkforceTable,
} from '../../src/features/eod/eod-sections';
import { useSettingsStore } from '../../src/store/settings';
import { useHaptics } from '../../src/hooks/use-haptics';
import { confirmDialog } from '../../src/utils/dialogs';
import { formatCountdown, formatDate, formatDateTime } from '../../src/utils/format';
import { usePalette } from '../../src/theme/theme-provider';
import { cn } from '../../src/utils/cn';
import { useNow } from '../../src/hooks/use-now';

const AUTOSAVE_DELAY_MS = 800;

/**
 * The End-of-Day report, per the client mockup: report date and automatic
 * submission time, daily workforce with live man-hours, totals, spectators,
 * daily HSE statistics and the operational summary.
 *
 * Offline first: every edit is autosaved to the device a moment after the
 * inspector stops typing, so a killed app or a dead battery loses nothing.
 * Only Submit is gated by the admin's window, and the screen always says why
 * it is shut - "the button is grey" with no reason is the fastest way to an
 * angry phone call at 23:45.
 */
export default function EodScreen(): React.JSX.Element {
  const { t } = useTranslation();
  const locale = useSettingsStore((state) => state.locale);
  const haptics = useHaptics();
  const params = useLocalSearchParams<{ stadiumId?: string }>();

  const { stadiums, loading: loadingStadiums } = useStadiums();
  const [stadiumId, setStadiumId] = useState<string | null>(params.stadiumId ?? null);
  const effectiveStadiumId = stadiumId ?? stadiums[0]?.id ?? null;
  const [reportDate, setReportDate] = useState<string | null>(null);

  const eod = useEod(effectiveStadiumId, reportDate);
  const readOnly = eod.alreadySubmitted;

  const [values, setValues] = useState<EodFormValues>(emptyEodForm);
  const [errors, setErrors] = useState<EodFieldErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [formKey, setFormKey] = useState<string | null>(null);
  const [loadedReportId, setLoadedReportId] = useState<string | null>(null);
  /** The inspector has typed since this form was loaded. */
  const [touched, setTouched] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  // Load the stored draft (or a fresh form) whenever the stadium or report
  // date changes, and pick up a draft that arrives from the database after
  // first render - unless the inspector has already started typing. Adjusting
  // state during render is React's documented pattern; an effect would flash
  // the empty form first.
  const key = `${effectiveStadiumId ?? ''}:${eod.date ?? ''}`;
  if (!eod.loading && key !== formKey) {
    setFormKey(key);
    setValues(eod.initialValues ?? emptyEodForm());
    setLoadedReportId(eod.report?.id ?? null);
    setTouched(false);
    setErrors({});
    setSubmitError(null);
    setSavedAt(null);
  } else if (key === formKey && eod.report && loadedReportId === null && !touched && eod.initialValues) {
    setLoadedReportId(eod.report.id);
    setValues(eod.initialValues);
  }

  // Debounced autosave to the device.
  const saveRef = useRef(eod.saveDraft);
  useEffect(() => {
    saveRef.current = eod.saveDraft;
  }, [eod.saveDraft]);
  useEffect(() => {
    if (!touched || readOnly) return;
    const timer = setTimeout(() => {
      void saveRef.current(values).then(() => setSavedAt(Date.now()));
    }, AUTOSAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [values, touched, readOnly]);

  const totals = useMemo(() => rowTotals(values.workforce), [values.workforce]);

  function update(patch: Partial<EodFormValues>): void {
    if (readOnly) return;
    setValues((current) => ({ ...current, ...patch }));
    setTouched(true);
    setSubmitError(null);
  }

  function updateRow(rowKey: string, patch: Partial<WorkforceRow>): void {
    if (readOnly) return;
    setValues((current) => ({
      ...current,
      workforce: current.workforce.map((row) => (row.key === rowKey ? { ...row, ...patch } : row)),
    }));
    setTouched(true);
    setErrors((current) => {
      const next = { ...current };
      delete next[`hours:${rowKey}`];
      delete next[`category:${rowKey}`];
      return next;
    });
  }

  function addRow(): void {
    haptics.answer();
    update({
      workforce: [...values.workforce, { key: newRowKey(), category: '', personnel: '', hours: '' }],
    });
  }

  function removeRow(rowKey: string): void {
    haptics.answer();
    update({ workforce: values.workforce.filter((row) => row.key !== rowKey) });
  }

  function setStat(field: EodDailyStatField, value: string): void {
    update({ stats: { ...values.stats, [field]: value } });
  }

  function setText(field: EodTextField, value: string): void {
    update({ [field]: value } as Partial<EodFormValues>);
    if (field === 'summary' && errors.summary) {
      setErrors((current) => {
        const next = { ...current };
        delete next.summary;
        return next;
      });
    }
  }

  function handleSubmit(): void {
    setSubmitError(null);
    const found = validateEodForm(values);
    setErrors(found);
    if (Object.keys(found).length > 0) {
      haptics.warning();
      setSubmitError(t('eod.errors.fixBeforeSubmit'));
      return;
    }
    if (!eod.canSubmit) {
      haptics.warning();
      setSubmitError(t('errors.EOD_WINDOW_CLOSED'));
      return;
    }

    confirmDialog({
      title: t('eod.submitTitle'),
      message: t('eod.submitBody'),
      confirmLabel: t('eod.submitAction'),
      cancelLabel: t('common.cancel'),
      onConfirm: () => {
        void (async () => {
          try {
            await eod.submit(values);
            haptics.success();
          } catch (error) {
            haptics.error();
            setSubmitError(
              t(`errors.${(error as Error).message}`, { defaultValue: t('errors.UNKNOWN') }),
            );
          }
        })();
      },
    });
  }

  if (!loadingStadiums && !effectiveStadiumId) {
    return (
      <Screen title={t('eod.title')}>
        <EmptyState title={t('eod.noStadiumTitle')} body={t('errors.STADIUM_OUT_OF_SCOPE')} />
      </Screen>
    );
  }

  if (loadingStadiums || eod.loading || !eod.stadium || formKey !== key) {
    return (
      <Screen title={t('eod.title')} wide contentClassName="gap-4">
        <Skeleton height={56} rounded="md" />
        <View className="flex-row gap-4">
          <Skeleton height={120} rounded="md" className="flex-1" />
          <Skeleton height={120} rounded="md" className="flex-1" />
        </View>
        <Skeleton height={360} rounded="md" />
        <Skeleton height={200} rounded="md" />
      </Screen>
    );
  }

  const timeZone = eod.stadium.timezone;
  const today = eod.today ?? '';
  const yesterday = today ? addDays(today, -1) : '';
  const dateLabel = (date: string): string =>
    formatDate(new Date(`${date}T12:00:00Z`), 'UTC', locale);

  return (
    <Screen
      title={t('eod.title')}
      wide
      contentClassName="gap-4"
      footer={
        readOnly ? (
          <View className="flex-row items-center justify-between gap-3 py-1">
            <Text variant="callout" tone="success" className="flex-1">
              {t('eod.alreadySubmitted')}
            </Text>
            {eod.report ? <SyncBadge state={eod.report.syncState} /> : null}
          </View>
        ) : (
          <View className="gap-2">
            {submitError ? <InlineError message={submitError} /> : null}
            <View className="flex-row items-center justify-between gap-3">
              <Text variant="caption" tone="subtle" className="flex-1" numberOfLines={1}>
                {savedAt || eod.report
                  ? t('eod.savedOnDevice')
                  : t('eod.autosaveHint')}
              </Text>
              {eod.report ? <SyncBadge state={eod.report.syncState} /> : null}
            </View>
            <Button
              label={t('eod.submitAction')}
              size="lg"
              icon={<SendIcon disabled={!eod.canSubmit} />}
              disabled={!eod.canSubmit}
              loading={eod.submitting}
              onPress={handleSubmit}
            />
          </View>
        )
      }
    >
      <Text variant="callout" tone="muted">
        {t('eod.subtitle')}
      </Text>

      <WindowBanner
        status={eod.window?.status ?? 'NONE'}
        closesAt={eod.window?.closesAt ?? null}
        opensAt={eod.window?.opensAt ?? null}
        startTime={eod.window?.today?.startTime ?? null}
        endTime={eod.window?.today?.endTime ?? null}
        timeZone={timeZone}
        locale={locale}
      />

      {stadiums.length > 1 ? (
        <FormCard overline={t('eod.stadium')}>
          <OptionList
            options={stadiums.map((stadium) => ({ value: stadium.id, label: stadium.displayName(locale) }))}
            value={effectiveStadiumId}
            onChange={(value) => {
              setStadiumId(value);
              setReportDate(null);
            }}
          />
        </FormCard>
      ) : null}

      {/* Report date + automatic submission time, side by side when there is room. */}
      <View className="flex-row flex-wrap gap-4">
        <View className="min-w-[260px] flex-1">
          <FormCard overline={t('eod.reportDate')} icon={CalendarDays} className="h-full">
            {readOnly ? (
              <Text variant="heading">{dateLabel(eod.date ?? today)}</Text>
            ) : (
              <SegmentedControl
                options={[
                  { value: today, label: t('eod.today') },
                  { value: yesterday, label: t('eod.yesterday') },
                ]}
                value={eod.date ?? today}
                onChange={(value) => setReportDate(value)}
              />
            )}
            {readOnly ? null : <Text variant="heading">{dateLabel(eod.date ?? today)}</Text>}
            <Text variant="caption" tone="subtle">
              {t('eod.reportDateHint')}
            </Text>
          </FormCard>
        </View>
        <View className="min-w-[260px] flex-1">
          <FormCard overline={t('eod.submission')} icon={Clock} className="h-full">
            <Text variant="heading">
              {eod.report?.submittedAt
                ? formatDateTime(eod.report.submittedAt, timeZone, locale)
                : t('eod.recordedAutomatically')}
            </Text>
            <Text variant="caption" tone="subtle">
              {t('eod.recordedAutomaticallyHint')}
            </Text>
          </FormCard>
        </View>
      </View>

      <WorkforceTable
        rows={values.workforce}
        readOnly={readOnly}
        errors={errors}
        onChange={updateRow}
        onRemove={removeRow}
        onAdd={addRow}
      />

      <TotalsTiles headcount={totals.totalHeadcount} manHours={totals.totalManHours} />

      <FormCard overline={t('eod.spectatorsOverline')}>
        <TextField
          label={t('eod.totalSpectators')}
          value={values.totalSpectators}
          placeholder="0"
          keyboardType="number-pad"
          inputMode="numeric"
          editable={!readOnly}
          optional
          onChangeText={(value) => update({ totalSpectators: sanitizeCountInput(value) })}
        />
      </FormCard>

      <StatsGrid values={values.stats} readOnly={readOnly} onChange={setStat} />

      <OperationalSummary
        values={values}
        readOnly={readOnly}
        errors={errors}
        onChange={setText}
      />
    </Screen>
  );
}

function SendIcon({ disabled }: { disabled: boolean }): React.JSX.Element {
  const palette = usePalette();
  return <Send size={18} color={disabled ? palette.fgSubtle : palette.onPrimary} />;
}

/** The submission window, always visible and always explained. */
function WindowBanner({
  status,
  closesAt,
  opensAt,
  startTime,
  endTime,
  timeZone,
  locale,
}: {
  status: 'OPEN' | 'CLOSED' | 'DISABLED' | 'NONE';
  closesAt: Date | null;
  opensAt: Date | null;
  startTime: string | null;
  endTime: string | null;
  timeZone: string;
  locale: string;
}): React.JSX.Element {
  const { t } = useTranslation();
  const open = status === 'OPEN';
  // Ticks so the countdown counts down.
  const now = useNow(15_000);
  const closesInMs = closesAt ? closesAt.getTime() - now : null;

  const message = open
    ? t('eod.window.open', { time: formatCountdown(Math.max(0, closesInMs ?? 0)) })
    : status === 'DISABLED'
      ? t('eod.window.disabled')
      : status === 'NONE'
        ? t('eod.window.none')
        : opensAt && opensAt.getTime() > now
          ? t('eod.window.opensAt', { time: formatDateTime(opensAt, timeZone, locale) })
          : t('eod.window.closed');

  return (
    <View
      accessibilityRole="summary"
      accessibilityLiveRegion="polite"
      className={cn(
        'flex-row items-center gap-3 rounded-md border px-4 py-3',
        open ? 'border-success bg-success-soft' : 'border-warning bg-warning-soft',
      )}
    >
      <View className={cn('rounded-full px-2.5 py-1', open ? 'bg-success' : 'bg-warning')}>
        <Text variant="overline" tone="inverse">
          {t(`eod.window.status.${status}`)}
        </Text>
      </View>
      <View className="flex-1 gap-0.5">
        <Text variant="callout" tone={open ? 'success' : 'warning'}>
          {message}
        </Text>
        {startTime && endTime ? (
          <Text variant="caption" tone="muted">
            {t('eod.window.hours', { start: startTime, end: endTime })}
          </Text>
        ) : null}
      </View>
    </View>
  );
}
