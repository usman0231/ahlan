import { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import Svg, { Rect } from 'react-native-svg';
import { useTranslation } from 'react-i18next';

import { Text } from './text';
import { motion, radius } from '../theme/tokens';
import { usePalette } from '../theme/theme-provider';

/**
 * A bar chart drawn with react-native-svg, so the same component renders on a
 * device and in the Expo web preview (Skia does not run on web here).
 *
 * Two layouts:
 *  - `horizontal`: one labelled row per category (type, severity, stadium).
 *    Best for long labels, and readable at phone width.
 *  - `vertical`: columns along a baseline, for a time series (daily counts).
 *
 * Bars are laid out with flex rows, never absolute x coordinates, so they
 * start from the reading edge in Arabic without any RTL special-casing. Bars
 * grow in once on mount with a Reanimated timing on measured pixels (a
 * percentage width on an Animated view is unreliable on the web renderer).
 */

export interface BarDatum {
  key: string;
  label: string;
  value: number;
  /** A palette colour; defaults to the chart's colour. */
  color?: string;
  /** Overrides the printed value, e.g. "12 (40%)". */
  valueLabel?: string;
}

export interface BarScale {
  /** The value a full-length bar represents (never below 1). */
  max: number;
  /** Each value as a fraction of `max`, clamped to 0..1. */
  ratios: number[];
}

/**
 * Pure scaling, separated so it can be unit tested.
 *
 * Negative and non-finite values draw as empty bars rather than breaking the
 * layout; an all-zero series still has a max of 1 so nothing divides by zero.
 */
export function computeBarScale(values: readonly number[], fixedMax?: number): BarScale {
  const clean = values.map((value) => (Number.isFinite(value) && value > 0 ? value : 0));
  const max = Math.max(1, fixedMax ?? 0, ...clean);
  return { max, ratios: clean.map((value) => Math.min(1, value / max)) };
}

/** Thins axis labels so a 30-day series does not print 30 overlapping dates. */
export function labelStride(count: number, maxLabels: number): number {
  if (count <= maxLabels || maxLabels <= 0) return 1;
  return Math.ceil(count / maxLabels);
}

export function BarChart({
  data,
  orientation = 'horizontal',
  height = 160,
  color,
  max,
  accessibilityLabel,
  formatValue = (value) => String(value),
  maxAxisLabels = 7,
  emptyLabel,
}: {
  data: BarDatum[];
  orientation?: 'horizontal' | 'vertical';
  /** Plot height for the vertical layout. */
  height?: number;
  color?: string;
  /** Pin the scale (e.g. 100 for percentages) instead of using the data max. */
  max?: number;
  /** Spoken summary for screen readers; defaults to "label: value" pairs. */
  accessibilityLabel?: string;
  formatValue?: (value: number) => string;
  /** Vertical layout only: the most axis labels to print. */
  maxAxisLabels?: number;
  emptyLabel?: string;
}): React.JSX.Element {
  const palette = usePalette();
  const { t } = useTranslation();
  const scale = useMemo(() => computeBarScale(data.map((datum) => datum.value), max), [data, max]);
  const fill = color ?? palette.accent;

  // One progress value drives every bar, so they grow together.
  const progress = useSharedValue(0);
  const dataKey = data.map((datum) => `${datum.key}:${datum.value}`).join('|');
  useEffect(() => {
    progress.value = 0;
    progress.value = withDelay(
      60,
      withTiming(1, { duration: motion.slow * 2, easing: Easing.out(Easing.cubic) }),
    );
  }, [dataKey, progress]);

  const spoken =
    accessibilityLabel ??
    data.map((datum) => `${datum.label}: ${datum.valueLabel ?? formatValue(datum.value)}`).join(', ');

  const allZero = data.every((datum) => !(datum.value > 0));
  if (data.length === 0 || allZero) {
    return (
      <View
        className="items-center justify-center rounded-md bg-surface-sunken px-4"
        style={{ minHeight: orientation === 'vertical' ? height : 72 }}
        accessibilityRole="text"
      >
        <Text variant="caption" tone="subtle" className="text-center">
          {emptyLabel ?? t('observations.dashboard.noData')}
        </Text>
      </View>
    );
  }

  if (orientation === 'horizontal') {
    return (
      <View className="gap-3" accessible accessibilityRole="image" accessibilityLabel={spoken}>
        {data.map((datum, index) => (
          <View key={datum.key} className="gap-1.5">
            <View className="flex-row items-baseline justify-between gap-3">
              <Text variant="callout" tone="muted" numberOfLines={1} className="flex-1">
                {datum.label}
              </Text>
              <Text variant="callout" tabular>
                {datum.valueLabel ?? formatValue(datum.value)}
              </Text>
            </View>
            <HorizontalBar
              ratio={scale.ratios[index] ?? 0}
              color={datum.color ?? fill}
              track={palette.surfaceSunken}
              progress={progress}
            />
          </View>
        ))}
      </View>
    );
  }

  const stride = labelStride(data.length, maxAxisLabels);
  const showValues = data.length <= 10;

  return (
    <View accessible accessibilityRole="image" accessibilityLabel={spoken} className="gap-2">
      <View className="flex-row items-end gap-1" style={{ height }}>
        {data.map((datum, index) => (
          <View key={datum.key} className="flex-1 items-center justify-end gap-1" style={{ height }}>
            {showValues ? (
              <Text variant="caption" tone="subtle" tabular numberOfLines={1}>
                {datum.valueLabel ?? formatValue(datum.value)}
              </Text>
            ) : null}
            <VerticalBar
              ratio={scale.ratios[index] ?? 0}
              plotHeight={height - (showValues ? 22 : 0)}
              color={datum.color ?? fill}
              progress={progress}
            />
          </View>
        ))}
      </View>
      {/* The baseline. */}
      <View className="h-px bg-border" />
      <View className="flex-row gap-1">
        {data.map((datum, index) => (
          <View key={datum.key} className="flex-1 items-center">
            {index % stride === 0 ? (
              <Text variant="caption" tone="subtle" numberOfLines={1}>
                {datum.label}
              </Text>
            ) : null}
          </View>
        ))}
      </View>
    </View>
  );
}

const BAR_THICKNESS = 10;

function HorizontalBar({
  ratio,
  color,
  track,
  progress,
}: {
  ratio: number;
  color: string;
  track: string;
  progress: SharedValue<number>;
}): React.JSX.Element {
  const [trackWidth, setTrackWidth] = useState(0);
  const target = trackWidth * ratio;
  // A non-zero value always shows a sliver, so "1" never looks like "0".
  const visible = ratio > 0 ? Math.max(target, BAR_THICKNESS) : 0;

  const grow = useAnimatedStyle(() => ({ width: visible * progress.value }));

  return (
    <View
      className="flex-row overflow-hidden"
      style={{ height: BAR_THICKNESS, borderRadius: radius.full, backgroundColor: track }}
      onLayout={(event) => setTrackWidth(event.nativeEvent.layout.width)}
    >
      <Animated.View style={[{ height: BAR_THICKNESS, overflow: 'hidden' }, grow]}>
        <Svg width={Math.max(visible, 1)} height={BAR_THICKNESS}>
          <Rect
            x={0}
            y={0}
            width={Math.max(visible, 1)}
            height={BAR_THICKNESS}
            rx={BAR_THICKNESS / 2}
            fill={color}
          />
        </Svg>
      </Animated.View>
    </View>
  );
}

function VerticalBar({
  ratio,
  plotHeight,
  color,
  progress,
}: {
  ratio: number;
  plotHeight: number;
  color: string;
  progress: SharedValue<number>;
}): React.JSX.Element {
  const [columnWidth, setColumnWidth] = useState(0);
  const barWidth = Math.max(4, Math.min(28, columnWidth * 0.7));
  const target = ratio > 0 ? Math.max(plotHeight * ratio, 4) : 0;

  const grow = useAnimatedStyle(() => ({ height: target * progress.value }));

  return (
    <View
      className="w-full items-center justify-end"
      onLayout={(event) => setColumnWidth(event.nativeEvent.layout.width)}
    >
      <Animated.View style={[{ width: barWidth, overflow: 'hidden', justifyContent: 'flex-end' }, grow]}>
        <Svg width={barWidth} height={Math.max(target, 1)}>
          <Rect
            x={0}
            y={0}
            width={barWidth}
            height={Math.max(target, 1)}
            rx={Math.min(6, barWidth / 2)}
            fill={color}
          />
        </Svg>
      </Animated.View>
    </View>
  );
}
