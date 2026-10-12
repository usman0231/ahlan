import { useMemo } from 'react';
import { View } from 'react-native';
import { Canvas, LinearGradient, Path, Skia, vec } from '@shopify/react-native-skia';
import { useTranslation } from 'react-i18next';
import type { TrendPoint } from '@ahlan/shared';

import { Text } from './text';
import { usePalette } from '../theme/theme-provider';

/**
 * The compliance trend.
 *
 * Drawn with Skia rather than SVG: a tournament-length series is up to 90
 * points, and the gradient fill plus smoothing would cost real frames as SVG
 * nodes. Points with no score (`null`) break the line instead of being plotted
 * as zero - an all-NA day is not a 0% day.
 *
 * Paths are assembled with `Skia.PathBuilder` (Skia 2 moved the mutable
 * moveTo/lineTo/quadTo methods off `SkPath` and onto the builder) and then
 * built into the immutable path the `Path` component takes.
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

    const line = Skia.PathBuilder.Make();
    const area = Skia.PathBuilder.Make();

    scored.forEach((point, index) => {
      const x = padding.left + index * stepX;
      const y = toY(point.compliancePercent ?? 0);

      if (index === 0) {
        line.moveTo(x, y);
        area.moveTo(x, padding.top + plotHeight);
        area.lineTo(x, y);
        return;
      }

      // A light quadratic smooth: enough to read as a trend, not so much that
      // it invents values between two days.
      const previous = scored[index - 1];
      const previousX = padding.left + (index - 1) * stepX;
      const previousY = toY(previous?.compliancePercent ?? 0);
      const midX = (previousX + x) / 2;

      line.quadTo(midX, previousY, x, y);
      area.quadTo(midX, previousY, x, y);
    });

    area.lineTo(padding.left + (scored.length - 1) * stepX, padding.top + plotHeight);
    area.close();

    return { line: line.build(), area: area.build() };
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
      <Canvas style={{ width: chartWidth, height }}>
        {paths ? (
          <>
            <Path path={paths.area} style="fill">
              <LinearGradient
                start={vec(0, padding.top)}
                end={vec(0, padding.top + plotHeight)}
                colors={[`${colour}55`, `${colour}00`]}
              />
            </Path>
            <Path
              path={paths.line}
              style="stroke"
              strokeWidth={2.5}
              strokeCap="round"
              strokeJoin="round"
              color={colour}
            />
          </>
        ) : null}
      </Canvas>

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

  const path = useMemo(() => {
    const builder = Skia.PathBuilder.Make();
    values.forEach((value, index) => {
      const barHeight = (value / max) * height;
      const x = index * (barWidth + gap);
      builder.addRRect(
        Skia.RRectXY(Skia.XYWHRect(x, height - barHeight, barWidth, barHeight), 2, 2),
      );
    });
    return builder.build();
  }, [values, max, height, barWidth]);

  return (
    <Canvas style={{ width, height }}>
      <Path path={path} style="fill" color={palette.accent} />
    </Canvas>
  );
}
