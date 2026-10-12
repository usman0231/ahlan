import { useEffect, useRef, useState } from 'react';
import { View, type ViewProps } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { cn } from '../utils/cn';

/**
 * Entrance motion.
 *
 * One vocabulary for the whole app: content rises 12dp and fades in on a
 * decelerating curve, staggered by position so a screen assembles top to
 * bottom instead of popping in at once. Runs on the UI thread, and honours
 * the OS "reduce motion" setting.
 *
 * Built on shared values rather than Reanimated's `entering` layout
 * animations: on web those hide the element until a CSS keyframe reports it
 * has started, and when that event never comes (a background tab, a keyframe
 * that failed to inject) the content stays invisible for good. A timing on a
 * shared value always lands on its final value.
 *
 * The animated wrapper carries only the animation; layout classes go on an
 * inner View, because the web renderer drops a className on an Animated view.
 */
const STAGGER_MS = 60;
const MAX_STAGGER_STEPS = 8;
const RISE_DP = 12;

function useEntrance(delay: number, duration: number) {
  const reduceMotion = useReducedMotion();
  const progress = useSharedValue(reduceMotion ? 1 : 0);

  useEffect(() => {
    if (reduceMotion) return;
    progress.value = withDelay(
      delay,
      withTiming(1, { duration, easing: Easing.out(Easing.cubic) }),
    );
  }, [delay, duration, progress, reduceMotion]);

  return progress;
}

export function Appear({
  index = 0,
  children,
  className,
  style,
  ...rest
}: ViewProps & { index?: number; className?: string }): React.JSX.Element {
  const progress = useEntrance(Math.min(index, MAX_STAGGER_STEPS) * STAGGER_MS, 460);

  const animated = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: (1 - progress.value) * RISE_DP }],
  }));

  return (
    <Animated.View style={animated}>
      <View className={cn(className)} style={style} {...rest}>
        {children}
      </View>
    </Animated.View>
  );
}

/** A plain fade with a hint of scale, for brand moments that should not travel. */
export function FadeAppear({
  delay = 0,
  children,
}: {
  delay?: number;
  children: React.ReactNode;
}): React.JSX.Element {
  const progress = useEntrance(delay, 560);

  const animated = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ scale: 0.96 + 0.04 * progress.value }],
  }));

  return <Animated.View style={animated}>{children}</Animated.View>;
}

/**
 * A figure that counts up to its value, on a decelerating curve.
 *
 * Runs on requestAnimationFrame and re-renders the text: a dozen frames of
 * one short string, which is cheaper than an animated TextInput and renders
 * identically on every platform. Starts from the last value shown, so a
 * refresh glides 87 -> 91 instead of restarting from zero.
 */
export function useCountUp(target: number, duration = 900): number {
  const reduceMotion = useReducedMotion();
  const [shown, setShown] = useState(reduceMotion ? target : 0);
  const from = useRef(reduceMotion ? target : 0);

  useEffect(() => {
    if (reduceMotion || !Number.isFinite(target)) {
      from.current = target;
      return;
    }
    const start = from.current;
    const began = Date.now();
    let frame = 0;
    const tick = (): void => {
      const t = Math.min(1, (Date.now() - began) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      const value = start + (target - start) * eased;
      from.current = value;
      setShown(value);
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, duration, reduceMotion]);

  // With reduced motion the figure is simply the figure; no frames at all.
  return reduceMotion || !Number.isFinite(target) ? target : shown;
}

/**
 * Renders a formatted figure that counts up. Strings that are not a plain
 * number ("—", "12.5%", "1,204") are parsed for their number and re-formatted
 * with the same decimals and suffix; anything else is shown as is.
 */
export function CountUp({ value, render }: {
  value: string;
  render: (text: string) => React.ReactNode;
}): React.JSX.Element {
  const match = /^(-?[\d,]*\.?\d+)(%?)$/.exec(value.trim());
  const digits = match?.[1] ?? '';
  const suffix = match?.[2] ?? '';
  const numeric = match ? Number(digits.replace(/,/g, '')) : NaN;
  const decimals = digits.split('.')[1]?.length ?? 0;
  const grouped = digits.includes(',');
  const current = useCountUp(Number.isFinite(numeric) ? numeric : 0);

  if (!match || !Number.isFinite(numeric)) return <>{render(value)}</>;

  const text = grouped
    ? current.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
    : current.toFixed(decimals);
  return <>{render(`${text}${suffix}`)}</>;
}

/**
 * A soft halo that ripples out from behind its child, for a live indicator
 * ("window open", "syncing"). Purely decorative and hidden from readers.
 */
export function Ping({ color, size = 10 }: { color: string; size?: number }): React.JSX.Element {
  const reduceMotion = useReducedMotion();
  const wave = useSharedValue(0);

  useEffect(() => {
    if (reduceMotion) return;
    wave.value = withRepeat(withTiming(1, { duration: 1600, easing: Easing.out(Easing.quad) }), -1, false);
  }, [wave, reduceMotion]);

  const halo = useAnimatedStyle(() => ({
    opacity: 0.55 * (1 - wave.value),
    transform: [{ scale: 1 + 1.6 * wave.value }],
  }));

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}
    >
      <Animated.View
        style={[
          { position: 'absolute', width: size, height: size, borderRadius: size, backgroundColor: color },
          halo,
        ]}
      />
      <View style={{ width: size, height: size, borderRadius: size, backgroundColor: color }} />
    </View>
  );
}
