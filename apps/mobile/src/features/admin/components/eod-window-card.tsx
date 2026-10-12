import { useEffect, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { CircleCheck } from 'lucide-react-native';

import { Button } from '../../../components/button';
import { Card } from '../../../components/card';
import { FadeAppear } from '../../../components/motion';
import { Skeleton } from '../../../components/skeleton';
import { InlineError } from '../../../components/states';
import { Text } from '../../../components/text';
import { ApiError } from '../../../api/client';
import { cn } from '../../../utils/cn';
import { fonts } from '../../../theme/tokens';
import { usePalette } from '../../../theme/theme-provider';
import { useHaptics } from '../../../hooks/use-haptics';
import { formatDateTime } from '../../../utils/format';
import { useEodWindowDefault, useSaveEodWindowDefault } from '../hooks';
import {
  crossesMidnight,
  formatDuration,
  isEodWindowDirty,
  validateEodWindowForm,
  windowDurationMinutes,
  type EodWindowFormValues,
} from '../eod-window-form';
import { TimeField } from './time-field';
import { WindowStatusBadge } from './admin-ui';

/**
 * "EOD Submission Window" (client mockup): start, end, enabled, live status
 * and Save. One global daily default; the API resolves per-stadium and
 * per-date overrides on top of it, and checks every submission against it.
 */
/** Three across on a wide card, one per row on a phone: no measuring needed. */
const FIELD = { flexGrow: 1, flexBasis: 220, minWidth: 0 } as const;

export function EodWindowCard(): React.JSX.Element {
  const { t, i18n } = useTranslation();
  const palette = usePalette();
  const haptics = useHaptics();
  const current = useEodWindowDefault();
  const save = useSaveEodWindowDefault();
  const [form, setForm] = useState<EodWindowFormValues | null>(null);
  const [savedNotice, setSavedNotice] = useState(false);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const saved = current.data
    ? {
        startTime: current.data.startTime,
        endTime: current.data.endTime,
        enabled: current.data.enabled,
      }
    : null;

  useEffect(
    () => () => {
      if (noticeTimer.current) clearTimeout(noticeTimer.current);
    },
    [],
  );

  // The form starts as the saved value and only diverges once edited, so the
  // once-a-minute status poll never overwrites what is being typed.
  const values = form ?? saved;
  const errors = values ? validateEodWindowForm(values) : {};
  const valid = Object.keys(errors).length === 0;
  const dirty = values ? isEodWindowDirty(saved, values) : false;

  const update = (patch: Partial<EodWindowFormValues>): void => {
    if (!values) return;
    setSavedNotice(false);
    setForm({ ...values, ...patch });
  };

  const onSave = (): void => {
    if (!values || !valid) {
      haptics.error();
      return;
    }
    save.mutate(
      { startTime: values.startTime, endTime: values.endTime, enabled: values.enabled },
      {
        onSuccess: (result) => {
          setForm({
            startTime: result.startTime,
            endTime: result.endTime,
            enabled: result.enabled,
          });
          setSavedNotice(true);
          if (noticeTimer.current) clearTimeout(noticeTimer.current);
          noticeTimer.current = setTimeout(() => setSavedNotice(false), 3500);
        },
      },
    );
  };

  const duration = values ? windowDurationMinutes(values.startTime, values.endTime) : null;
  const span = duration !== null ? formatDuration(duration) : null;

  return (
    <Card className="gap-5">
      <View className="flex-row flex-wrap items-start justify-between gap-3">
        <View className="min-w-[200px] flex-1 gap-1">
          <Text variant="title">{t('admin.eodWindow.title')}</Text>
          <Text variant="caption" tone="muted">
            {t('admin.eodWindow.subtitle')}
          </Text>
        </View>
        {current.data ? (
          <WindowStatusBadge status={current.data.status} />
        ) : (
          <Skeleton height={28} width={140} rounded="full" />
        )}
      </View>

      {!values ? (
        current.isError ? (
          <InlineError message={t('admin.eodWindow.loadError')} />
        ) : (
          <View className="gap-3">
            <Skeleton height={52} rounded="md" />
            <Skeleton height={52} rounded="md" />
          </View>
        )
      ) : (
        <View
          className="gap-4"
          style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start' }}
        >
          <View style={FIELD}>
            <TimeField
              label={t('admin.eodWindow.start')}
              value={values.startTime}
              onChange={(startTime) => update({ startTime })}
              error={errors.startTime ? t(errors.startTime) : null}
            />
          </View>
          <View style={FIELD}>
            <TimeField
              label={t('admin.eodWindow.end')}
              value={values.endTime}
              onChange={(endTime) => update({ endTime })}
              error={errors.endTime ? t(errors.endTime) : null}
            />
          </View>
          <View className="gap-2" style={FIELD}>
            <Text variant="callout" style={{ fontFamily: fonts.semibold }}>
              {t('admin.eodWindow.statusLabel')}
            </Text>
            <Pressable
              accessibilityRole="switch"
              accessibilityLabel={t('admin.eodWindow.statusLabel')}
              accessibilityState={{ checked: values.enabled }}
              onPress={() => {
                haptics.answer();
                update({ enabled: !values.enabled });
              }}
              className={cn(
                'min-h-[52px] flex-row items-center justify-center gap-2 rounded-md border',
                values.enabled
                  ? 'border-success bg-success-soft'
                  : 'border-border bg-surface-sunken',
              )}
            >
              <View
                className={cn(
                  'h-2.5 w-2.5 rounded-full',
                  values.enabled ? 'bg-success' : 'bg-fg-subtle',
                )}
              />
              <Text
                variant="callout"
                tone={values.enabled ? 'success' : 'muted'}
                style={{ fontFamily: fonts.bold }}
              >
                {values.enabled ? t('admin.eodWindow.enabled') : t('admin.eodWindow.disabled')}
              </Text>
            </Pressable>
          </View>
        </View>
      )}

      {values && span && valid ? (
        <Text variant="caption" tone="muted">
          {t('admin.eodWindow.summary', {
            start: values.startTime,
            end: values.endTime,
            hours: span.hours,
            minutes: span.minutes,
            zone: current.data?.timezone ?? '',
          })}
          {crossesMidnight(values.startTime, values.endTime)
            ? ` ${t('admin.eodWindow.overnight')}`
            : ''}
        </Text>
      ) : null}

      {save.isError ? (
        <InlineError
          message={
            save.error instanceof ApiError && save.error.isOffline
              ? t('admin.eodWindow.offline')
              : t('admin.eodWindow.saveError')
          }
        />
      ) : null}

      <View className="flex-row flex-wrap items-center gap-4">
        <Button
          label={t('admin.eodWindow.save')}
          fullWidth={false}
          loading={save.isPending}
          disabled={!values || !valid || !dirty}
          onPress={onSave}
        />
        {savedNotice ? (
          <FadeAppear>
            <View
              accessibilityLiveRegion="polite"
              className="flex-row items-center gap-2 rounded-full bg-success-soft px-3 py-2"
            >
              <CircleCheck size={16} color={palette.success} />
              <Text variant="caption" tone="success" style={{ fontFamily: fonts.semibold }}>
                {t('admin.eodWindow.saved')}
              </Text>
            </View>
          </FadeAppear>
        ) : current.data?.updatedAt ? (
          <Text variant="caption" tone="subtle">
            {t('admin.eodWindow.lastSaved', {
              when: formatDateTime(
                new Date(current.data.updatedAt),
                current.data.timezone,
                i18n.language,
              ),
            })}
          </Text>
        ) : null}
      </View>
    </Card>
  );
}
