import { Pressable, ScrollView, Switch, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import { Text } from './text';
import { cn } from '../utils/cn';
import { elevation, fonts, motion } from '../theme/tokens';
import { usePalette } from '../theme/theme-provider';
import { useHaptics } from '../hooks/use-haptics';

export interface Option<T extends string> {
  value: T;
  label: string;
  /** Shown under the label in a list-style picker. */
  description?: string;
}

/**
 * A horizontally scrolling filter row.
 *
 * Scrollable rather than wrapping: six disciplines plus "All" never fit on a
 * phone, and a wrapped row pushes the list below the fold.
 */
export function ChipRow<T extends string>({
  options,
  value,
  onChange,
  className,
}: {
  options: Option<T>[];
  value: T | null;
  onChange: (value: T | null) => void;
  className?: string;
}): React.JSX.Element {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: 20, gap: 8 }}
      className={cn('max-h-[52px] grow-0', className)}
    >
      {options.map((option) => (
        <Chip
          key={option.value}
          label={option.label}
          selected={value === option.value}
          // Tapping the selected chip clears the filter.
          onPress={() => onChange(value === option.value ? null : option.value)}
        />
      ))}
    </ScrollView>
  );
}

export function Chip({
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
      accessibilityState={{ selected }}
      onPress={onPress}
      className={cn(
        'h-touch items-center justify-center rounded-full border px-4',
        selected ? 'border-primary-fill bg-primary-fill' : 'border-border bg-surface',
      )}
    >
      <Text
        variant="callout"
        tone={selected ? 'onPrimary' : 'muted'}
        style={selected ? { fontFamily: fonts.semibold } : undefined}
      >
        {label}
      </Text>
    </Pressable>
  );
}

/**
 * A segmented control with a sliding indicator.
 *
 * The indicator is a Reanimated translate rather than a re-render, so switching
 * tabs stays smooth while the incoming tab is still fetching.
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  className,
}: {
  options: Option<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}): React.JSX.Element {
  const haptics = useHaptics();
  const palette = usePalette();
  const index = Math.max(
    0,
    options.findIndex((option) => option.value === value),
  );
  const offset = useSharedValue(index);

  const animatedStyle = useAnimatedStyle(() => ({
    left: `${(offset.value * 100) / options.length}%`,
    width: `${100 / options.length}%`,
  }));

  return (
    <View className={cn('relative h-touch flex-row rounded-full bg-surface-sunken p-1', className)}>
      <Animated.View
        // Styled inline: a className on an Animated view is dropped by the
        // web renderer (see MetricBar), and the thumb must exist everywhere.
        style={[
          animatedStyle,
          elevation.card,
          {
            position: 'absolute',
            top: 4,
            bottom: 4,
            borderRadius: 999,
            // Raised, not plain surface: in dark mode surface sits too close
            // to the sunken track to read as a thumb.
            backgroundColor: palette.surfaceRaised,
            borderWidth: 1,
            borderColor: palette.cardBorder,
          },
        ]}
      />
      {options.map((option, optionIndex) => (
        <Pressable
          key={option.value}
          accessibilityRole="tab"
          accessibilityState={{ selected: option.value === value }}
          onPress={() => {
            haptics.answer();
            offset.value = withSpring(optionIndex, motion.bouncy);
            onChange(option.value);
          }}
          className="flex-1 items-center justify-center px-2"
        >
          <Text
            numberOfLines={1}
            variant="callout"
            tone={option.value === value ? 'default' : 'muted'}
            style={option.value === value ? { fontFamily: fonts.semibold } : undefined}
          >
            {option.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

/** A vertical list of options, for pickers that need room to explain each one. */
export function OptionList<T extends string>({
  options,
  value,
  onChange,
  multiple = false,
  selectedValues = [],
}: {
  options: Option<T>[];
  value?: T | null;
  onChange: (value: T) => void;
  multiple?: boolean;
  selectedValues?: T[];
}): React.JSX.Element {
  return (
    <View className="overflow-hidden rounded-lg border border-card-border bg-surface">
      {options.map((option, index) => {
        const selected = multiple ? selectedValues.includes(option.value) : value === option.value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole={multiple ? 'checkbox' : 'radio'}
            accessibilityState={{ selected }}
            onPress={() => onChange(option.value)}
            className={cn(
              'min-h-touch flex-row items-center gap-3 px-4 py-3 active:bg-surface-sunken',
              index > 0 && 'border-t border-border',
            )}
          >
            <View className="flex-1 gap-0.5">
              <Text variant="body">{option.label}</Text>
              {option.description ? (
                <Text variant="caption" tone="muted">
                  {option.description}
                </Text>
              ) : null}
            </View>

            <View
              className={cn(
                'h-6 w-6 items-center justify-center border-2',
                multiple ? 'rounded-xs' : 'rounded-full',
                selected ? 'border-primary-fill bg-primary-fill' : 'border-border-strong',
              )}
            >
              {selected ? (
                <Text variant="caption" tone="onPrimary">
                  {multiple ? '✓' : '●'}
                </Text>
              ) : null}
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

/** A settings row with a native switch. */
export function ToggleRow({
  label,
  description,
  value,
  onChange,
}: {
  label: string;
  description?: string;
  value: boolean;
  onChange: (value: boolean) => void;
}): React.JSX.Element {
  const palette = usePalette();

  return (
    <View className="min-h-touch flex-row items-center gap-4 px-4 py-3">
      <View className="flex-1 gap-0.5">
        <Text variant="body">{label}</Text>
        {description ? (
          <Text variant="caption" tone="muted">
            {description}
          </Text>
        ) : null}
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        accessibilityLabel={label}
        trackColor={{ true: palette.primaryFill, false: palette.borderStrong }}
        thumbColor={value ? palette.onPrimary : palette.surfaceRaised}
      />
    </View>
  );
}
