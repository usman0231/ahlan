import { ActivityIndicator, Pressable, View, type PressableProps } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { Text } from './text';
import { cn } from '../utils/cn';
import { fonts, motion } from '../theme/tokens';
import { useHaptics } from '../hooks/use-haptics';
import { usePalette } from '../theme/theme-provider';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends Omit<PressableProps, 'children' | 'style'> {
  label: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  /** Rendered before the label; use a 20dp icon. */
  icon?: React.ReactNode;
  fullWidth?: boolean;
  /** Fires a haptic tap on press. On by default for primary actions. */
  haptic?: boolean;
  className?: string;
}

const containerClass: Record<ButtonVariant, string> = {
  primary: 'bg-primary-fill active:opacity-90',
  // Tonal, not outlined: a wash of the brand colour reads as "secondary to
  // the solid button" at a glance, where a hairline outline reads as a form
  // field. This is also what keeps it legible in dark mode.
  secondary: 'bg-primary-soft active:bg-primary-soft/70',
  ghost: 'bg-transparent active:bg-surface-sunken',
  danger: 'bg-danger',
  success: 'bg-success',
};

const labelTone: Record<ButtonVariant, 'inverse' | 'default' | 'primary' | 'onPrimary'> = {
  // Graphite on volt in every theme: lime never carries white ink.
  primary: 'onPrimary',
  secondary: 'primary',
  ghost: 'primary',
  danger: 'inverse',
  success: 'inverse',
};

// Every size clears the 48dp minimum from the UI standards; `sm` is 48 exactly.
// Pills throughout: a capsule reads as "press me" before the label is read.
const sizeClass: Record<ButtonSize, string> = {
  sm: 'min-h-touch rounded-full px-5',
  md: 'min-h-[52px] rounded-full px-6',
  lg: 'min-h-[58px] rounded-full px-7',
};

/**
 * The primary action control.
 *
 * Press feedback is a Reanimated scale on the UI thread, so it stays smooth
 * while the JS thread is busy writing an inspection to the local database -
 * which is exactly when the inspector is pressing Submit.
 */
export function Button({
  label,
  variant = 'primary',
  size = 'md',
  loading = false,
  icon,
  fullWidth = true,
  haptic,
  disabled,
  onPress,
  className,
  ...rest
}: ButtonProps): React.JSX.Element {
  const haptics = useHaptics();
  const palette = usePalette();
  const scale = useSharedValue(1);
  const opacity = useSharedValue(1);

  const isDisabled = Boolean(disabled) || loading;
  const shouldVibrate = haptic ?? (variant === 'primary' || variant === 'danger');

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  return (
    <Animated.View style={[animatedStyle, fullWidth ? { width: '100%' } : null]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ disabled: isDisabled, busy: loading }}
        disabled={isDisabled}
        onPressIn={() => {
          scale.value = withSpring(0.97, motion.spring);
          opacity.value = withTiming(0.9, { duration: motion.fast });
        }}
        onPressOut={() => {
          scale.value = withSpring(1, motion.spring);
          opacity.value = withTiming(1, { duration: motion.fast });
        }}
        onPress={(event) => {
          if (shouldVibrate) haptics.answer();
          onPress?.(event);
        }}
        className={cn(
          'flex-row items-center justify-center gap-2',
          containerClass[variant],
          sizeClass[size],
          isDisabled && 'opacity-50',
          className,
        )}
        style={
          variant === 'primary' && !isDisabled
            ? {
                // A volt glow rather than a gray drop shadow: the button
                // looks lit, which is the whole hi-vis idea.
                shadowColor: palette.primaryFill,
                shadowOpacity: 0.45,
                shadowRadius: 16,
                shadowOffset: { width: 0, height: 6 },
                elevation: 3,
              }
            : undefined
        }
        {...rest}
      >
        {loading ? (
          <ActivityIndicator
            size="small"
            // Matches the label colour for the variant.
            color={
              variant === 'primary'
                ? palette.onPrimary
                : variant === 'secondary' || variant === 'ghost'
                  ? palette.primary
                  : palette.fgInverse
            }
          />
        ) : (
          <>
            {icon ? <View className="shrink-0">{icon}</View> : null}
            <Text
              variant="callout"
              tone={labelTone[variant]}
              numberOfLines={1}
              // Action labels sit a step heavier than running callout text.
              style={{ fontFamily: fonts.semibold, fontSize: 15 }}
            >
              {label}
            </Text>
          </>
        )}
      </Pressable>
    </Animated.View>
  );
}

/**
 * A square icon-only button, 48dp, for toolbars. Needs an accessibility label
 * because there is no visible text.
 */
export function IconButton({
  icon,
  accessibilityLabel,
  onPress,
  variant = 'ghost',
  disabled,
  className,
}: {
  icon: React.ReactNode;
  accessibilityLabel: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  className?: string;
}): React.JSX.Element {
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Animated.View style={animatedStyle}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        disabled={disabled}
        onPressIn={() => (scale.value = withSpring(0.92, motion.spring))}
        onPressOut={() => (scale.value = withSpring(1, motion.spring))}
        onPress={onPress}
        className={cn(
          'h-touch w-touch items-center justify-center rounded-full',
          containerClass[variant],
          disabled && 'opacity-40',
          className,
        )}
      >
        {icon}
      </Pressable>
    </Animated.View>
  );
}
