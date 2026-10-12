import { View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { useEffect, useState } from 'react';
import Animated, {
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  Easing,
  type SharedValue,
} from 'react-native-reanimated';
import type { ComplianceBand } from '@ahlan/shared';

import { Text } from './text';
import { Card, PressableCard } from './card';
import { CountUp, useCountUp } from './motion';
import { cn } from '../utils/cn';
import { bandColor } from '../theme/tokens';
import { usePalette } from '../theme/theme-provider';
import { motion } from '../theme/tokens';

export interface KpiCardProps {
  label: string;
  value: string;
  /** Secondary line, e.g. "8 Yes / 2 No / 5 N/A". */
  hint?: string;
  /** Percentage-point change against the previous period. */
  delta?: number | null;
  tone?: 'default' | 'success' | 'warning' | 'danger';
  onPress?: () => void;
  className?: string;
}

const dotClass = {
  default: 'bg-primary',
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
} as const;

const valueTone = {
  default: 'default',
  success: 'success',
  warning: 'warning',
  danger: 'danger',
} as const;

/**
 * One figure, its label, and optionally how it moved.
 *
 * The delta carries an arrow as well as a colour, so the direction is readable
 * without relying on colour vision.
 */
export function KpiCard({
  label,
  value,
  hint,
  delta,
  tone = 'default',
  onPress,
  className,
}: KpiCardProps): React.JSX.Element {
  const body = (
    <View className="gap-2">
      <View className="flex-row items-center gap-2">
        {/* A tone dot, so a warning figure is flagged before it is read. */}
        <View className={cn('h-2 w-2 rounded-full', dotClass[tone])} />
        <Text variant="overline" tone="subtle" numberOfLines={1} className="flex-1">
          {label}
        </Text>
      </View>
      <View className="flex-row items-baseline gap-2">
        <CountUp
          value={value}
          render={(text) => (
            <Text variant="metric" tone={valueTone[tone]} tabular>
              {text}
            </Text>
          )}
        />
        {delta !== null && delta !== undefined ? (
          <Text variant="caption" tone={delta >= 0 ? 'success' : 'danger'} tabular>
            {delta >= 0 ? '↑' : '↓'} {Math.abs(delta).toFixed(1)}
          </Text>
        ) : null}
      </View>
      {hint ? (
        <Text variant="caption" tone="muted" numberOfLines={1}>
          {hint}
        </Text>
      ) : null}
    </View>
  );

  if (onPress) {
    return (
      // Sized on an outer View: PressableCard's animated wrapper is what sits
      // in the row, so flex classes on the card itself never reach the row.
      <View className={cn('min-w-[45%] flex-1', className)}>
        <PressableCard onPress={onPress} accessibilityLabel={`${label}: ${value}`}>
          {body}
        </PressableCard>
      </View>
    );
  }

  return <Card className={cn('min-w-[45%] flex-1', className)}>{body}</Card>;
}

/**
 * The compliance ring.
 *
 * Drawn with SVG rather than Skia: it is a single arc, and SVG keeps it cheap
 * enough to put several on one screen. Skia is reserved for the trend charts,
 * where there is real drawing to do.
 */
/**
 * `strokeDashoffset` is the only thing that moves, so the arc is animated
 * through the prop rather than through a style. Created once at module scope:
 * `createAnimatedComponent` inside a render would hand React a new component
 * type every frame and remount the circle.
 */
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export function ComplianceRing({
  percent,
  band,
  size = 128,
  strokeWidth = 12,
  label,
  inverse = false,
}: {
  percent: number | null;
  band: ComplianceBand | null;
  size?: number;
  strokeWidth?: number;
  label?: string;
  /** For a ring sitting on a brand surface: inverse ink, translucent track. */
  inverse?: boolean;
}): React.JSX.Element {
  const palette = usePalette();
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  // 0 when there is no score, so an unscored ring reads as an empty track
  // rather than sweeping to some arbitrary figure.
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withTiming(percent === null ? 0 : percent / 100, {
      duration: motion.reveal,
      easing: Easing.out(Easing.cubic),
    });
  }, [percent, progress]);

  const arcProps = useAnimatedProps(() => ({
    strokeDashoffset: circumference * (1 - progress.value),
  }));

  // On the graphite hero the arc is volt and the track a veil of white; the
  // band colour would fight the glow there.
  const colour = inverse ? palette.primaryFill : bandColor(band, palette);
  const track = inverse ? `${palette.onHero}1F` : palette.surfaceSunken;
  const shown = useCountUp(percent ?? 0, motion.reveal);

  return (
    <View className="items-center justify-center" style={{ width: size, height: size }}>
      <Svg width={size} height={size}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={track}
          strokeWidth={strokeWidth}
          fill="none"
        />
        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={percent === null ? palette.border : colour}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={`${circumference} ${circumference}`}
          animatedProps={arcProps}
          fill="none"
          // Start at twelve o'clock rather than three.
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>

      {/* Pinned to all four edges: an absolute child with no insets sits at its
          static position rather than being centred by the parent. */}
      <View className="absolute inset-0 items-center justify-center">
        <Text variant="title" tone={inverse ? 'onHero' : 'default'} tabular>
          {percent === null ? '—' : `${Math.round(shown)}%`}
        </Text>
        {label ? (
          <Text variant="caption" tone={inverse ? 'onHero' : 'muted'} className={inverse ? 'opacity-75' : undefined}>
            {label}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

/** A horizontal bar for a per-stadium or per-discipline comparison row. */
export function MetricBar({
  label,
  percent,
  band,
  trailing,
}: {
  label: string;
  percent: number | null;
  band: ComplianceBand | null;
  trailing?: string;
}): React.JSX.Element {
  const palette = usePalette();
  // Measured in pixels: animating a percentage width string is flaky on the
  // web renderer, and pixels behave identically everywhere.
  const [trackWidth, setTrackWidth] = useState(0);
  const width = useSharedValue(0);

  useEffect(() => {
    width.value = withTiming(trackWidth * ((percent ?? 0) / 100), {
      duration: motion.reveal,
      easing: Easing.out(Easing.cubic),
    });
  }, [percent, trackWidth, width]);

  const animatedStyle = useAnimatedStyle(() => ({ width: width.value }));

  return (
    <View className="gap-2">
      <View className="flex-row items-center justify-between gap-3">
        <Text variant="callout" numberOfLines={1} className="flex-1">
          {label}
        </Text>
        <Text variant="callout" tone="muted" tabular>
          {trailing ?? (percent === null ? '—' : `${percent.toFixed(1)}%`)}
        </Text>
      </View>
      <View
        className="h-2 overflow-hidden rounded-full bg-surface-sunken"
        onLayout={(event) => setTrackWidth(event.nativeEvent.layout.width)}
      >
        <Animated.View
          // Height and radius live in the style: a className on an Animated
          // view is dropped by the web renderer, which left a 0-high fill.
          style={[
            animatedStyle,
            { height: 8, borderRadius: 999, backgroundColor: bandColor(band, palette) },
          ]}
        />
      </View>
    </View>
  );
}

const METER_SEGMENTS = 24;

/**
 * The instrument meter on the graphite hero: a row of segments that light up
 * in volt, one after another, up to the score. Reads like a gauge on a piece
 * of test equipment, which is the point - it is a measurement, not a mood.
 */
export function ComplianceMeter({ percent }: { percent: number | null }): React.JSX.Element {
  const progress = useSharedValue(0);
  const lit = percent === null ? 0 : Math.round((percent / 100) * METER_SEGMENTS);

  useEffect(() => {
    progress.value = withTiming(lit, { duration: motion.reveal, easing: Easing.out(Easing.cubic) });
  }, [lit, progress]);

  return (
    <View
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: percent === null ? undefined : Math.round(percent) }}
      className="flex-row gap-1"
    >
      {Array.from({ length: METER_SEGMENTS }).map((_, index) => (
        <MeterSegment key={index} index={index} progress={progress} />
      ))}
    </View>
  );
}

function MeterSegment({
  index,
  progress,
}: {
  index: number;
  progress: SharedValue<number>;
}): React.JSX.Element {
  const palette = usePalette();
  const style = useAnimatedStyle(() => {
    // 0 -> 1 as the sweep passes this segment.
    const on = Math.max(0, Math.min(1, progress.value - index));
    return {
      backgroundColor: on > 0.5 ? palette.primaryFill : `${palette.onHero}1F`,
      transform: [{ scaleY: 0.72 + 0.28 * on }],
    };
  });
  return <Animated.View style={[{ flex: 1, height: 22, borderRadius: 3 }, style]} />;
}
