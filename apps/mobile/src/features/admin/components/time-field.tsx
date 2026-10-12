import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Clock } from 'lucide-react-native';

import { Text } from '../../../components/text';
import { FadeAppear } from '../../../components/motion';
import { cn } from '../../../utils/cn';
import { fonts } from '../../../theme/tokens';
import { usePalette } from '../../../theme/theme-provider';
import { useHaptics } from '../../../hooks/use-haptics';
import { formatHourMinute, parseHourMinute } from '../eod-window-form';

const HOURS = Array.from({ length: 24 }, (_, hour) => hour);
const MINUTES = Array.from({ length: 12 }, (_, index) => index * 5);

/**
 * A 24-hour time picker that works the same on a phone and in a browser,
 * without a native date-time dependency: the field shows `HH:mm`, and a tap
 * opens an inline grid of hours and five-minute steps. Every cell is a 48dp
 * target, and the grid flows from the reading edge, so it is RTL-safe.
 */
export function TimeField({
  label,
  value,
  onChange,
  error,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string | null;
  disabled?: boolean;
}): React.JSX.Element {
  const { t } = useTranslation();
  const palette = usePalette();
  const haptics = useHaptics();
  const [open, setOpen] = useState(false);
  const parsed = parseHourMinute(value);

  const pick = (hour: number, minute: number): void => {
    haptics.answer();
    onChange(formatHourMinute(hour, minute));
  };

  return (
    <View className="gap-2">
      <Text variant="callout" style={{ fontFamily: fonts.semibold }}>
        {label}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${value}`}
        accessibilityHint={t('admin.eodWindow.pickTimeHint')}
        accessibilityState={{ expanded: open, disabled }}
        disabled={disabled}
        onPress={() => setOpen((current) => !current)}
        className={cn(
          'min-h-[52px] flex-row items-center justify-between gap-3 rounded-md border bg-surface px-4',
          error ? 'border-danger' : open ? 'border-accent' : 'border-border',
          disabled && 'opacity-50',
        )}
      >
        <Text variant="heading" tabular>
          {parsed ? value : '--:--'}
        </Text>
        <Clock size={20} color={open ? palette.accent : palette.fgMuted} />
      </Pressable>
      {error ? (
        <Text variant="caption" tone="danger" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}

      {open ? (
        <FadeAppear>
          <View className="gap-3 rounded-md border border-border bg-surface-sunken p-3">
            <Text variant="overline" tone="subtle">
              {t('admin.eodWindow.hour')}
            </Text>
            <View className="flex-row flex-wrap gap-1.5">
              {HOURS.map((hour) => (
                <Cell
                  key={hour}
                  label={String(hour).padStart(2, '0')}
                  selected={parsed?.hour === hour}
                  onPress={() => pick(hour, parsed?.minute ?? 0)}
                />
              ))}
            </View>
            <Text variant="overline" tone="subtle">
              {t('admin.eodWindow.minute')}
            </Text>
            <View className="flex-row flex-wrap gap-1.5">
              {MINUTES.map((minute) => (
                <Cell
                  key={minute}
                  label={`:${String(minute).padStart(2, '0')}`}
                  selected={parsed?.minute === minute}
                  onPress={() => pick(parsed?.hour ?? 0, minute)}
                />
              ))}
            </View>
            <Pressable
              accessibilityRole="button"
              onPress={() => setOpen(false)}
              className="min-h-touch items-center justify-center rounded-full bg-primary-soft"
            >
              <Text variant="callout" tone="primary" style={{ fontFamily: fonts.semibold }}>
                {t('common.done')}
              </Text>
            </Pressable>
          </View>
        </FadeAppear>
      ) : null}
    </View>
  );
}

function Cell({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}): React.JSX.Element {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      onPress={onPress}
      className={cn(
        'h-touch min-w-[52px] items-center justify-center rounded-sm px-2',
        selected ? 'bg-primary-fill' : 'bg-surface active:opacity-80',
      )}
    >
      <Text
        variant="callout"
        tone={selected ? 'onPrimary' : 'default'}
        tabular
        style={selected ? { fontFamily: fonts.bold } : undefined}
      >
        {label}
      </Text>
    </Pressable>
  );
}
