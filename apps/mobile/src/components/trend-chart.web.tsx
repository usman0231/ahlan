import { useMemo } from 'react';
import { View } from 'react-native';
import Svg, { Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg';
import { useTranslation } from 'react-i18next';
import type { TrendPoint } from '@ahlan/shared';

import { Text } from './text';
import { usePalette } from '../theme/theme-provider';

/**
 * The web build of the trend chart.
 *
 * The native build draws this with Skia, which on web would mean shipping and
 * initialising the CanvasKit WASM bundle. For a browser preview of the UI that
 * is not worth it, so the same shapes are drawn with SVG instead - the maths,
 * the colour thresholds and the "a null score breaks the line rather than
 * plotting zero" rule are identical.
 */
export function TrendChart({
  points,
  height = 160,
  width,
}: {
  points: TrendPoint[];
  height?: number;
  width?: number;
}): React.JSX.Element {
  const palette = usePalette();
  const { t } = useTranslation();

  const chartWidth = width ?? 320;
  const padding = { top: 12, bottom: 24, left: 8, right: 8 };
  const plotWidth = chartWidth - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;

  const scored = useMemo(
    () => points.filter((point) => point.compliancePercent !== null),
    [points],
  );

  const paths = useMemo(() => {
    if (scored.length < 2) return null;

    const stepX = plotWidth / Math.max(1, scored.length - 1);
    const toY = (percent: number) => padding.top + plotHeight - (percent / 100) * plotHeight;

    let line = '';
    scored.forEach((point, index) => {
      const x = padding.left + index * stepX;
      const y = toY(point.compliancePercent ?? 0);

      if (index === 0) {
        line += `M ${x} ${y}`;
        return;
      }
      const previousX = padding.left + (index - 1) * stepX;
      const previousY = toY(scored[index - 1]?.compliancePercent ?? 0);
      const midX = (previousX + x) / 2;
      line += ` Q ${midX} ${previousY} ${x} ${y}`;
    });

    const lastX = padding.left + (scored.length - 1) * stepX;
    const baseline = padding.top + plotHeight;
    const area = `M ${padding.left} ${baseline} L ${padding.left} ${toY(
      scored[0]?.compliancePercent ?? 0,
    )}${line.slice(line.indexOf(' Q'))} L ${lastX} ${baseline} Z`;

    return { line, area };
  }, [scored, plotWidth, plotHeight, padding.left, padding.top]);

  if (scored.length < 2) {
    return (
      <View
        style={{ height }}
        className="items-center justify-center rounded-lg bg-surface-sunken"
      >
        <Text variant="caption" tone="subtle">
          {t('states.emptyBody')}
        </Text>
      </View>
    );
  }

  const first = scored[0];
  const last = scored[scored.length - 1];
  const latest = last?.compliancePercent ?? 0;
  const colour = latest >= 85 ? palette.success : latest >= 70 ? palette.warning : palette.danger;

  return (
    <View className="gap-2">
      <Svg width={chartWidth} height={height}>
        <Defs>
          <LinearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={colour} stopOpacity={0.33} />
            <Stop offset="1" stopColor={colour} stopOpacity={0} />
          </LinearGradient>
        </Defs>
        {paths ? (
          <>
            <Path d={paths.area} fill="url(#trendFill)" />
            <Path
              d={paths.line}
              stroke={colour}
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
          </>
        ) : null}
      </Svg>

      <View className="flex-row justify-between">
        <Text variant="caption" tone="subtle">
          {first?.date}
        </Text>
        <Text variant="caption" tone="subtle">
          {last?.date}
        </Text>
      </View>
    </View>
  );
}

/** A compact bar series, for per-day inspection counts. */
export function BarSeries({
  values,
  height = 48,
  width = 320,
}: {
  values: number[];
  height?: number;
  width?: number;
}): React.JSX.Element {
  const palette = usePalette();
  const max = Math.max(1, ...values);
  const gap = 3;
  const barWidth = Math.max(2, (width - gap * (values.length - 1)) / Math.max(1, values.length));

  return (
    <Svg width={width} height={height}>
      {values.map((value, index) => {
        const barHeight = (value / max) * height;
        return (
          <Rect
            key={index}
            x={index * (barWidth + gap)}
            y={height - barHeight}
            width={barWidth}
            height={barHeight}
            rx={2}
            fill={palette.accent}
          />
        );
      })}
    </Svg>
  );
}
