import { Pressable, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import {
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  ClipboardCheck,
  Eye,
  Users,
} from 'lucide-react-native';

import { Text } from '../../../components/text';
import { ProgressBar } from '../../../components/progress-bar';
import { Skeleton } from '../../../components/skeleton';
import { cn } from '../../../utils/cn';
import { elevation, fonts, radius } from '../../../theme/tokens';
import { usePalette } from '../../../theme/theme-provider';
import { useHaptics } from '../../../hooks/use-haptics';
import type { TemplateTone } from '../completion-summary';

const tint: Record<TemplateTone, { soft: string; text: string }> = {
  info: { soft: 'bg-info-soft', text: 'text-info' },
  warning: { soft: 'bg-warning-soft', text: 'text-warning' },
  success: { soft: 'bg-success-soft', text: 'text-success' },
  danger: { soft: 'bg-danger-soft', text: 'text-danger' },
};

/**
 * A master checklist template (client mockup "Admin checklist…"): tinted top
 * edge and icon well, "Master template" badge, category overline, title,
 * number of checks, then today's completion and two actions.
 */
export function ChecklistTemplateCard({
  tone,
  title,
  itemCount,
  completed,
  expected,
  pending,
  completionLoading,
  onView,
  onCompletion,
}: {
  tone: TemplateTone;
  title: string;
  itemCount: number;
  completed: number;
  expected: number;
  pending: number;
  completionLoading?: boolean;
  onView: () => void;
  onCompletion: () => void;
}): React.JSX.Element {
  const { t, i18n } = useTranslation();
  const palette = usePalette();
  const haptics = useHaptics();
  const Chevron = i18n.dir() === 'rtl' ? ChevronLeft : ChevronRight;
  const color = palette[tone];
  const classes = tint[tone];

  return (
    <View
      className="overflow-hidden rounded-lg border border-card-border bg-surface"
      style={[elevation.card, { borderTopWidth: 4, borderTopColor: color }]}
    >
      <View className="gap-4 p-5">
        <View className="flex-row items-start justify-between gap-3">
          <View className={cn('h-12 w-12 items-center justify-center rounded-md', classes.soft)}>
            <ClipboardCheck size={22} color={color} />
          </View>
          <View className={cn('rounded-full px-3 py-1', classes.soft)}>
            <Text variant="overline" className={classes.text}>
              {t('checklists.masterTemplate')}
            </Text>
          </View>
        </View>

        <View className="gap-1">
          <Text variant="overline" tone="subtle">
            {t('checklists.readinessChecklist')}
          </Text>
          <Text variant="title" numberOfLines={2}>
            {title}
          </Text>
          <View className="flex-row items-center gap-1.5 pt-0.5">
            <CircleCheck size={14} color={palette.fgSubtle} />
            <Text variant="caption" tone="muted">
              {t('checklists.checks', { count: itemCount })}
            </Text>
          </View>
        </View>

        {/* Completion for the selected day */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('checklists.completionA11y', { title, completed, expected })}
          onPress={() => {
            haptics.answer();
            onCompletion();
          }}
          className="min-h-touch gap-2 rounded-md bg-surface-sunken p-3 active:opacity-80"
        >
          {completionLoading ? (
            <>
              <Skeleton height={16} width="60%" />
              <Skeleton height={8} rounded="full" />
            </>
          ) : (
            <>
              <View className="flex-row items-center justify-between gap-2">
                <Text variant="caption" tone="muted" numberOfLines={1} className="flex-1">
                  {t('checklists.completed')}
                </Text>
                <Text variant="callout" tabular style={{ fontFamily: fonts.bold }}>
                  {completed}/{expected}
                </Text>
              </View>
              <ProgressBar value={expected > 0 ? completed / expected : 0} />
              <View className="flex-row items-center justify-between gap-2">
                <Text
                  variant="caption"
                  tone={pending > 0 ? 'warning' : expected > 0 ? 'success' : 'subtle'}
                  className="flex-1"
                  numberOfLines={1}
                >
                  {expected === 0
                    ? t('checklists.nobodyExpected')
                    : pending > 0
                      ? t('checklists.pendingCount', { count: pending })
                      : t('checklists.allDone')}
                </Text>
                <View className="flex-row items-center gap-1">
                  <Users size={14} color={palette.fgMuted} />
                  <Text variant="caption" tone="muted" style={{ fontFamily: fonts.semibold }}>
                    {t('checklists.inspectors')}
                  </Text>
                  <Chevron size={14} color={palette.fgMuted} />
                </View>
              </View>
            </>
          )}
        </Pressable>

        <CardAction
          icon={<Eye size={18} color={palette.fg} />}
          label={t('checklists.view')}
          onPress={onView}
        />
      </View>
    </View>
  );
}

function CardAction({
  icon,
  label,
  onPress,
}: {
  icon: React.ReactNode;
  label: string;
  onPress: () => void;
}): React.JSX.Element {
  const haptics = useHaptics();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={() => {
        haptics.answer();
        onPress();
      }}
      className="min-h-touch flex-row items-center justify-center gap-2 border border-border bg-surface-sunken px-3 active:opacity-80"
      style={{ borderRadius: radius.sm }}
    >
      {icon}
      <Text variant="callout" numberOfLines={1} style={{ fontFamily: fonts.semibold }}>
        {label}
      </Text>
    </Pressable>
  );
}
