import { Pressable, View, type ViewProps } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import { Text } from './text';
import { cn } from '../utils/cn';
import { elevation, motion, radius } from '../theme/tokens';
import { usePalette } from '../theme/theme-provider';

export interface CardProps extends ViewProps {
  /** Lifts the card off the background with a deeper shadow. */
  raised?: boolean;
  padded?: boolean;
  className?: string;
}

/**
 * The surface everything sits on.
 *
 * Light mode separates planes with a soft, wide shadow and an edge you only
 * notice when it is missing; dark mode separates them by surface lightness
 * plus a hairline, where the same faint alpha shadow simply disappears
 * instead of smudging. Depth here is quiet.
 */
export function Card({
  raised = false,
  padded = true,
  className,
  children,
  style,
  ...rest
}: CardProps): React.JSX.Element {
  return (
    <View
      className={cn(
        'rounded-lg border border-card-border bg-surface',
        padded && 'p-5',
        className,
      )}
      style={[raised ? elevation.raised : elevation.card, style]}
      {...rest}
    >
      {children}
    </View>
  );
}

/** A card that is the whole tap target, with the same press feedback as Button. */
export function PressableCard({
  onPress,
  accessibilityLabel,
  disabled,
  tone = 'default',
  className,
  children,
}: {
  onPress: () => void;
  /** `volt`: the solid brand fill, for the single most important tile. */
  tone?: 'default' | 'volt';
  accessibilityLabel?: string;
  disabled?: boolean;
  className?: string;
  children: React.ReactNode;
}): React.JSX.Element {
  const palette = usePalette();
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const voltGlow = {
    shadowColor: palette.primaryFill,
    shadowOpacity: 0.4,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  };

  return (
    // The shadow lives on the animated wrapper, so it needs the card's radius
    // too or web draws it as a square behind rounded corners.
    <Animated.View
      style={[animatedStyle, tone === 'volt' ? voltGlow : elevation.card, { borderRadius: radius.lg }]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        disabled={disabled}
        onPressIn={() => (scale.value = withSpring(0.985, motion.spring))}
        onPressOut={() => (scale.value = withSpring(1, motion.spring))}
        onPress={onPress}
        className={cn(
          'rounded-lg border p-5',
          tone === 'volt'
            ? 'border-primary-fill bg-primary-fill active:opacity-90'
            : 'border-card-border bg-surface active:bg-surface-sunken',
          disabled && 'opacity-50',
          className,
        )}
      >
        {children}
      </Pressable>
    </Animated.View>
  );
}

/** A labelled group of rows, used across the admin and settings screens. */
export function Section({
  title,
  action,
  children,
  className,
}: {
  title?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}): React.JSX.Element {
  return (
    <View className={cn('gap-3', className)}>
      {title || action ? (
        <View className="flex-row items-center justify-between ps-1">
          {title ? (
            <Text variant="overline" tone="subtle">
              {title}
            </Text>
          ) : (
            <View />
          )}
          {action}
        </View>
      ) : null}
      {children}
    </View>
  );
}
