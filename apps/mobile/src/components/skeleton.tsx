import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  Easing,
} from 'react-native-reanimated';

import { cn } from '../utils/cn';

/**
 * Skeleton placeholders.
 *
 * The UI standards rule out blank screens and bare spinners, so every screen
 * that loads shows the shape of what is coming. The shimmer runs on the UI
 * thread, which is the point: the JS thread is busy doing the actual loading.
 */
export function Skeleton({
  className,
  height,
  width,
  rounded = 'sm',
}: {
  className?: string;
  height?: number;
  width?: number | `${number}%`;
  rounded?: 'xs' | 'sm' | 'md' | 'full';
}): React.JSX.Element {
  const progress = useSharedValue(0.35);

  useEffect(() => {
    progress.value = withRepeat(
      withTiming(0.75, { duration: 900, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
  }, [progress]);

  const animatedStyle = useAnimatedStyle(() => ({ opacity: progress.value }));

  const roundedClass =
    rounded === 'full' ? 'rounded-full' : rounded === 'md' ? 'rounded-md' : rounded === 'xs' ? 'rounded-xs' : 'rounded-sm';

  return (
    <Animated.View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[animatedStyle, { height: height ?? 16, width }]}
      className={cn('bg-surface-sunken', roundedClass, className)}
    />
  );
}

/** A few lines of placeholder text. */
export function SkeletonText({
  lines = 3,
  className,
}: {
  lines?: number;
  className?: string;
}): React.JSX.Element {
  return (
    <View className={cn('gap-2', className)}>
      {Array.from({ length: lines }).map((_, index) => (
        <Skeleton
          key={index}
          height={14}
          // The last line is short, the way real text wraps.
          width={index === lines - 1 ? '60%' : '100%'}
        />
      ))}
    </View>
  );
}

/** Matches the shape of a list row, so the layout does not jump on load. */
export function SkeletonListItem(): React.JSX.Element {
  return (
    <View className="flex-row items-center gap-3 rounded-lg border border-card-border bg-surface p-4">
      <Skeleton height={44} width={44} rounded="md" />
      <View className="flex-1 gap-2">
        <Skeleton height={15} width="70%" />
        <Skeleton height={12} width="45%" />
      </View>
      <Skeleton height={22} width={60} rounded="full" />
    </View>
  );
}

export function SkeletonList({ count = 5 }: { count?: number }): React.JSX.Element {
  return (
    <View className="gap-3">
      {Array.from({ length: count }).map((_, index) => (
        <SkeletonListItem key={index} />
      ))}
    </View>
  );
}

/** Matches the KPI card grid on the dashboard and home screens. */
export function SkeletonKpiGrid({ count = 4 }: { count?: number }): React.JSX.Element {
  return (
    <View className="flex-row flex-wrap gap-3">
      {Array.from({ length: count }).map((_, index) => (
        <View
          key={index}
          className="min-w-[45%] flex-1 gap-3 rounded-lg border border-card-border bg-surface p-4"
        >
          <Skeleton height={11} width="50%" />
          <Skeleton height={30} width="70%" />
          <Skeleton height={11} width="40%" />
        </View>
      ))}
    </View>
  );
}
