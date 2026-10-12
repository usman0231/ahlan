import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { useEffect } from 'react';
import type { FindingStatus, Severity, SyncState } from '@ahlan/shared';

import { Text } from './text';
import { cn } from '../utils/cn';
import { severityClass } from '../theme/tokens';

export type BadgeTone = 'neutral' | 'primary' | 'success' | 'warning' | 'danger' | 'info';

const toneClass: Record<BadgeTone, string> = {
  neutral: 'bg-surface-sunken',
  primary: 'bg-primary-soft',
  success: 'bg-success-soft',
  warning: 'bg-warning-soft',
  danger: 'bg-danger-soft',
  info: 'bg-info-soft',
};

/** The status dot: a second channel beside the label, never instead of it. */
const toneDot: Record<BadgeTone, string> = {
  neutral: 'bg-fg-subtle',
  primary: 'bg-primary',
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
  info: 'bg-info',
};

const toneText: Record<BadgeTone, string> = {
  neutral: 'text-fg-muted',
  primary: 'text-primary',
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-danger',
  info: 'text-info',
};

export function Badge({
  label,
  tone = 'neutral',
  className,
}: {
  label: string;
  tone?: BadgeTone;
  className?: string;
}): React.JSX.Element {
  return (
    <View
      className={cn(
        'flex-row items-center gap-1.5 self-start rounded-full px-2.5 py-1',
        toneClass[tone],
        className,
      )}
    >
      <View className={cn('h-1.5 w-1.5 rounded-full', toneDot[tone])} />
      <Text variant="overline" className={toneText[tone]}>
        {label}
      </Text>
    </View>
  );
}

/** Severity, using the dedicated severity tokens rather than the tone scale. */
export function SeverityBadge({
  severity,
  className,
}: {
  severity: Severity;
  className?: string;
}): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <View className={cn('self-start rounded-full px-2.5 py-1', severityClass[severity], className)}>
      <Text variant="overline" className={severityClass[severity].split(' ')[1]}>
        {t(`findings.severities.${severity}`)}
      </Text>
    </View>
  );
}

const statusTone: Record<FindingStatus, BadgeTone> = {
  OPEN: 'danger',
  ACTION_ASSIGNED: 'warning',
  IN_PROGRESS: 'info',
  PENDING_VERIFICATION: 'primary',
  CLOSED: 'success',
};

/**
 * Finding status. `isOverdue` is passed in rather than read from the status,
 * because OVERDUE is derived from the due date and is never a stored status.
 */
export function StatusBadge({
  status,
  isOverdue = false,
  className,
}: {
  status: FindingStatus;
  isOverdue?: boolean;
  className?: string;
}): React.JSX.Element {
  const { t } = useTranslation();

  if (isOverdue && status !== 'CLOSED') {
    return <Badge label={t('findings.statuses.OVERDUE')} tone="danger" className={className} />;
  }
  return (
    <Badge
      label={t(`findings.statuses.${status}`)}
      tone={statusTone[status]}
      className={className}
    />
  );
}

/**
 * Per-record sync state, as the UI standards require: saved on device /
 * syncing / synced / failed. The syncing state pulses so it is obviously
 * in-flight rather than stuck.
 */
export function SyncBadge({
  state,
  className,
}: {
  state: SyncState;
  className?: string;
}): React.JSX.Element {
  const { t } = useTranslation();
  const pulse = useSharedValue(1);

  useEffect(() => {
    if (state !== 'SYNCING') {
      pulse.value = 1;
      return;
    }
    pulse.value = withRepeat(withTiming(0.45, { duration: 700 }), -1, true);
  }, [state, pulse]);

  const animatedStyle = useAnimatedStyle(() => ({ opacity: pulse.value }));

  const tone: BadgeTone =
    state === 'SYNCED'
      ? 'success'
      : state === 'FAILED'
        ? 'danger'
        : state === 'SYNCING'
          ? 'info'
          : 'neutral';

  const label = t(
    state === 'SYNCED'
      ? 'sync.synced'
      : state === 'FAILED'
        ? 'sync.failed'
        : state === 'SYNCING'
          ? 'sync.syncing'
          : 'sync.local',
  );

  return (
    <Animated.View style={state === 'SYNCING' ? animatedStyle : undefined}>
      <Badge label={label} tone={tone} className={className} />
    </Animated.View>
  );
}

/** Small count badge for tab bars and list headers. */
export function CountBadge({ count }: { count: number }): React.JSX.Element | null {
  if (count <= 0) return null;
  return (
    <View className="min-w-[20px] items-center justify-center rounded-full bg-danger px-1.5 py-0.5">
      <Text variant="overline" tone="inverse">
        {count > 99 ? '99+' : String(count)}
      </Text>
    </View>
  );
}
