import { Pressable, View } from 'react-native';
import { router, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { CalendarCheck, ClipboardList, ScanEye, type LucideIcon } from 'lucide-react-native';
import { zonedDateString } from '@ahlan/shared';

import { Text } from '../../../components/text';
import { Skeleton } from '../../../components/skeleton';
import { cn } from '../../../utils/cn';
import { elevation, fonts } from '../../../theme/tokens';
import { usePalette } from '../../../theme/theme-provider';
import { useHaptics } from '../../../hooks/use-haptics';
import { summariseCompletion } from '../completion-summary';
import { REVIEW_TIMEZONE } from '../eod-window-form';
import { useChecklistCompletion, useEodWindowDefault } from '../hooks';

/**
 * Today at a glance, one tap from the dashboard: the EOD window, readiness
 * checklist completion, and the HSE observation dashboards.
 */
export function OverviewShortcuts(): React.JSX.Element {
  const { t } = useTranslation();
  const today = zonedDateString(new Date(), REVIEW_TIMEZONE);
  const window = useEodWindowDefault();
  const completion = useChecklistCompletion(today);
  const totals = completion.data ? summariseCompletion(completion.data) : null;

  const eodValue = window.data
    ? t(`admin.eodWindow.short.${window.data.status}`)
    : window.isError
      ? '—'
      : null;
  const eodHint = window.data ? `${window.data.startTime}–${window.data.endTime}` : undefined;

  return (
    <View className="flex-row flex-wrap gap-3">
      <Shortcut
        icon={CalendarCheck}
        label={t('admin.shortcuts.eod')}
        value={eodValue}
        hint={eodHint}
        tone={window.data?.status === 'OPEN' ? 'success' : 'default'}
        href="/(admin)/eod-reports"
      />
      <Shortcut
        icon={ClipboardList}
        label={t('admin.shortcuts.checklists')}
        value={totals ? `${totals.completed}/${totals.expected}` : completion.isError ? '—' : null}
        hint={
          totals && totals.pending > 0
            ? t('checklists.pendingCount', { count: totals.pending })
            : undefined
        }
        href="/(admin)/checklists"
      />
      <Shortcut
        icon={ScanEye}
        label={t('admin.shortcuts.hse')}
        value={t('admin.shortcuts.hseValue')}
        href="/(admin)/hse"
      />
    </View>
  );
}

function Shortcut({
  icon: IconComponent,
  label,
  value,
  hint,
  tone = 'default',
  href,
}: {
  icon: LucideIcon;
  label: string;
  value: string | null;
  hint?: string;
  tone?: 'default' | 'success';
  href: Href;
}): React.JSX.Element {
  const palette = usePalette();
  const haptics = useHaptics();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}${value ? `: ${value}` : ''}`}
      onPress={() => {
        haptics.answer();
        router.push(href);
      }}
      className="min-h-[96px] min-w-[150px] flex-1 gap-2 rounded-lg border border-card-border bg-surface p-4 active:bg-surface-sunken"
      style={elevation.card}
    >
      <View className="flex-row items-center gap-2">
        <View
          className={cn(
            'h-8 w-8 items-center justify-center rounded-sm',
            tone === 'success' ? 'bg-success-soft' : 'bg-accent-soft',
          )}
        >
          <IconComponent size={17} color={tone === 'success' ? palette.success : palette.accent} />
        </View>
        <Text variant="overline" tone="subtle" numberOfLines={2} className="flex-1">
          {label}
        </Text>
      </View>
      {value === null ? (
        <Skeleton height={22} width="60%" />
      ) : (
        <Text
          variant="heading"
          tone={tone === 'success' ? 'success' : 'default'}
          tabular
          numberOfLines={1}
          style={{ fontFamily: fonts.semibold }}
        >
          {value}
        </Text>
      )}
      {hint ? (
        <Text variant="caption" tone="muted" numberOfLines={1}>
          {hint}
        </Text>
      ) : null}
    </Pressable>
  );
}
