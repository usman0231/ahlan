import { useState } from 'react';
import { Pressable, View, type LayoutChangeEvent } from 'react-native';
import { useTranslation } from 'react-i18next';
import { CalendarDays, ChevronLeft, ChevronRight, type LucideIcon } from 'lucide-react-native';
import { addDays, type EodWindowState } from '@ahlan/shared';

import { Text } from '../../../components/text';
import { cn } from '../../../utils/cn';
import { elevation, fonts } from '../../../theme/tokens';
import { usePalette } from '../../../theme/theme-provider';
import { useHaptics } from '../../../hooks/use-haptics';
import { formatLongDate } from '../../../utils/format';

/**
 * Small building blocks shared by the admin EOD, checklist and HSE screens.
 */

/* ------------------------------- info banner ------------------------------- */

/** The mockup's "Administrator view" note: icon well, title, one line, violet edge. */
export function InfoBanner({
  icon: IconComponent,
  title,
  body,
}: {
  icon: LucideIcon;
  title: string;
  body: string;
}): React.JSX.Element {
  const palette = usePalette();
  return (
    <View
      className="flex-row items-center gap-4 rounded-lg border border-card-border bg-surface p-4"
      style={[elevation.card, { borderStartWidth: 4, borderStartColor: palette.accent }]}
    >
      <View className="h-12 w-12 items-center justify-center rounded-md bg-accent-soft">
        <IconComponent size={22} color={palette.accent} />
      </View>
      <View className="flex-1 gap-0.5">
        <Text variant="heading">{title}</Text>
        <Text variant="caption" tone="muted">
          {body}
        </Text>
      </View>
    </View>
  );
}

/* --------------------------- window status badge --------------------------- */

const statusClass: Record<EodWindowState, { box: string; text: string; dot: string }> = {
  OPEN: { box: 'bg-success-soft', text: 'text-success', dot: 'bg-success' },
  CLOSED: { box: 'bg-warning-soft', text: 'text-warning', dot: 'bg-warning' },
  DISABLED: { box: 'bg-surface-sunken', text: 'text-fg-muted', dot: 'bg-fg-subtle' },
};

export function WindowStatusBadge({ status }: { status: EodWindowState }): React.JSX.Element {
  const { t } = useTranslation();
  const tone = statusClass[status];
  return (
    <View
      accessible
      accessibilityLabel={t(`admin.eodWindow.status.${status}`)}
      className={cn('flex-row items-center gap-2 self-start rounded-full px-3 py-1.5', tone.box)}
    >
      <View className={cn('h-2 w-2 rounded-full', tone.dot)} />
      <Text variant="overline" className={tone.text}>
        {t(`admin.eodWindow.status.${status}`)}
      </Text>
    </View>
  );
}

/* ------------------------------- date stepper ------------------------------ */

/**
 * Previous day / date / next day. Works everywhere without a native date
 * picker; the next arrow stops at `max` (today), since the future has no data.
 */
export function DateStepper({
  value,
  onChange,
  max,
}: {
  value: string;
  onChange: (value: string) => void;
  max: string;
}): React.JSX.Element {
  const { t, i18n } = useTranslation();
  const palette = usePalette();
  const haptics = useHaptics();
  const rtl = i18n.dir() === 'rtl';
  const Back = rtl ? ChevronRight : ChevronLeft;
  const Forward = rtl ? ChevronLeft : ChevronRight;
  const atMax = value >= max;
  const label =
    value === max
      ? t('common.today')
      : value === addDays(max, -1)
        ? t('common.yesterday')
        : formatLongDate(new Date(`${value}T12:00:00Z`), i18n.language);

  const step = (days: number): void => {
    haptics.answer();
    onChange(addDays(value, days));
  };

  return (
    <View
      className="flex-row items-center gap-2 rounded-full border border-card-border bg-surface p-1"
      style={elevation.card}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('admin.previousDay')}
        onPress={() => step(-1)}
        className="h-touch w-touch items-center justify-center rounded-full active:bg-surface-sunken"
      >
        <Back size={20} color={palette.fg} />
      </Pressable>
      <View className="flex-1 flex-row items-center justify-center gap-2">
        <CalendarDays size={16} color={palette.accent} />
        <Text variant="callout" style={{ fontFamily: fonts.semibold }} numberOfLines={1}>
          {label}
        </Text>
        <Text variant="caption" tone="subtle" tabular>
          {value}
        </Text>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('admin.nextDay')}
        accessibilityState={{ disabled: atMax }}
        disabled={atMax}
        onPress={() => step(1)}
        className={cn(
          'h-touch w-touch items-center justify-center rounded-full active:bg-surface-sunken',
          atMax && 'opacity-30',
        )}
      >
        <Forward size={20} color={palette.fg} />
      </Pressable>
    </View>
  );
}

/* ---------------------------------- grid ---------------------------------- */

/**
 * Lays children out in equal columns sized to the container (not the window,
 * which on a wide browser is far wider than the column a screen actually has).
 */
export function CardGrid({
  minColumnWidth = 260,
  maxColumns = 4,
  gap = 16,
  children,
}: {
  minColumnWidth?: number;
  maxColumns?: number;
  gap?: number;
  children: React.ReactNode[];
}): React.JSX.Element {
  const [width, setWidth] = useState(0);
  const columns =
    width > 0
      ? Math.max(1, Math.min(maxColumns, Math.floor((width + gap) / (minColumnWidth + gap))))
      : 1;
  const itemWidth = width > 0 ? (width - gap * (columns - 1)) / columns : undefined;

  return (
    <View
      className="flex-row flex-wrap"
      style={{ gap }}
      onLayout={(event: LayoutChangeEvent) => setWidth(Math.floor(event.nativeEvent.layout.width))}
    >
      {children.map((child, index) => (
        <View key={index} style={{ width: itemWidth ?? '100%' }}>
          {child}
        </View>
      ))}
    </View>
  );
}
