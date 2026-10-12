import { Pressable, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useEffect } from 'react';
import type { ResponseValue } from '@ahlan/shared';

import { Text } from './text';
import { cn } from '../utils/cn';
import { motion } from '../theme/tokens';
import { useHaptics } from '../hooks/use-haptics';

const OPTIONS: ResponseValue[] = ['YES', 'NO', 'NA'];

/**
 * The checklist answer control, and the single most-used control in the app.
 *
 * Three deliberate choices:
 *   - each option is a full-height 56dp target, usable in gloves without
 *     looking closely
 *   - YES / NO / NA are colour *and* label, never colour alone
 *   - every tap fires a haptic, because the inspector often has the phone at
 *     waist height while looking at the scaffold rather than the screen
 */
export function AnswerToggle({
  value,
  onChange,
  allowNa = true,
  disabled = false,
  className,
}: {
  value: ResponseValue | null;
  onChange: (value: ResponseValue) => void;
  allowNa?: boolean;
  disabled?: boolean;
  className?: string;
}): React.JSX.Element {
  const { t } = useTranslation();
  const haptics = useHaptics();
  const options = allowNa ? OPTIONS : OPTIONS.filter((option) => option !== 'NA');

  return (
    <View
      accessibilityRole="radiogroup"
      className={cn(
        'flex-row gap-1.5 rounded-lg bg-surface-sunken p-1.5',
        disabled && 'opacity-60',
        className,
      )}
    >
      {options.map((option) => (
        <AnswerOption
          key={option}
          option={option}
          label={t(`common.${option.toLowerCase()}`)}
          selected={value === option}
          disabled={disabled}
          onPress={() => {
            haptics.answer();
            onChange(option);
          }}
        />
      ))}
    </View>
  );
}

const selectedClass: Record<ResponseValue, string> = {
  YES: 'bg-success',
  NO: 'bg-danger',
  NA: 'bg-fg-subtle',
};

function AnswerOption({
  option,
  label,
  selected,
  disabled,
  onPress,
}: {
  option: ResponseValue;
  label: string;
  selected: boolean;
  disabled: boolean;
  onPress: () => void;
}): React.JSX.Element {
  const scale = useSharedValue(1);
  const fill = useSharedValue(selected ? 1 : 0);

  useEffect(() => {
    fill.value = withTiming(selected ? 1 : 0, { duration: motion.fast });
    if (selected) {
      // A small overshoot makes the selection unmistakable at a glance.
      scale.value = withSpring(1.05, motion.bouncy, () => {
        scale.value = withSpring(1, motion.spring);
      });
    }
  }, [selected, fill, scale]);

  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Animated.View style={[animatedStyle, { flex: 1 }]}>
      <Pressable
        accessibilityRole="radio"
        accessibilityState={{ selected, disabled }}
        accessibilityLabel={label}
        testID={label}
        disabled={disabled}
        onPress={onPress}
        className={cn(
          'h-[56px] items-center justify-center rounded-md',
          selected ? selectedClass[option] : 'border border-card-border bg-surface',
        )}
      >
        <Text variant="callout" tone={selected ? 'inverse' : 'muted'}>
          {label}
        </Text>
      </Pressable>
    </Animated.View>
  );
}
