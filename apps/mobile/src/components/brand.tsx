import { useEffect, useId } from 'react';
import { View, type ViewProps } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import Svg, {
  Circle,
  Defs,
  G,
  Line,
  LinearGradient,
  Path,
  RadialGradient,
  Rect,
  Stop,
} from 'react-native-svg';

import { Text } from './text';
import { cn } from '../utils/cn';
import { usePalette } from '../theme/theme-provider';
import { fonts } from '../theme/tokens';

/**
 * The Ahlan brand.
 *
 * Everything here is vector and token-driven, so the mark is crisp at any
 * size, works in every theme, and costs nothing to load. The same geometry is
 * exported to the app icon and favicon (see `assets/brand/`), so the icon on
 * the home screen and the mark on the sign-in screen are one drawing.
 */

/** SVG ids must be unique per instance and safe inside `url(#...)`. */
function useSvgId(prefix: string): string {
  return `${prefix}${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
}

/**
 * The mark: a geometric "A" - also a roof apex, the stadium - crossed by a
 * hi-vis stripe, the reflective band on a safety vest. Ahlan, the venue, and
 * the people keeping it safe, in two strokes and a bar.
 */
export function LogoMark({
  size = 44,
  variant = 'color',
}: {
  size?: number;
  /** `color`: graphite tile, for chalk and graphite backgrounds alike.
   *  `onHero`: volt tile, for the graphite hero where a dark tile would vanish. */
  variant?: 'color' | 'onHero';
}): React.JSX.Element {
  const palette = usePalette();
  const tileId = useSvgId('tile');
  const sheenId = useSvgId('sheen');

  const onHero = variant === 'onHero';
  const ink = onHero ? palette.onPrimary : palette.onHero;
  const stripe = onHero ? palette.onPrimary : palette.primaryFill;
  // The gap around the stripe is drawn in the tile colour, so the band reads
  // as laid over the letter rather than fused into it.
  const gap = onHero ? palette.primaryFill : palette.heroTo;

  return (
    <Svg width={size} height={size} viewBox="0 0 64 64" accessibilityRole="image">
      <Defs>
        <LinearGradient id={tileId} x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={onHero ? palette.primaryFill : palette.heroFrom} />
          <Stop offset="1" stopColor={onHero ? palette.primaryFill : palette.heroTo} />
        </LinearGradient>
        <LinearGradient id={sheenId} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={palette.onHero} stopOpacity={onHero ? 0.35 : 0.1} />
          <Stop offset="0.5" stopColor={palette.onHero} stopOpacity={0} />
        </LinearGradient>
      </Defs>

      {/* Tile: a superellipse-ish rounded square, like the OS icon mask. */}
      <Rect x="0" y="0" width="64" height="64" rx="18" fill={`url(#${tileId})`} />
      <Rect x="0" y="0" width="64" height="64" rx="18" fill={`url(#${sheenId})`} />

      {/* The A: two heavy strokes meeting at the apex. */}
      <Path
        d="M17 49 L32 15 L47 49"
        fill="none"
        stroke={ink}
        strokeWidth={7.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* The hi-vis band, overshooting both legs. */}
      <Line x1="13" y1="37" x2="51" y2="37" stroke={gap} strokeWidth={9} strokeLinecap="round" />
      <Line x1="13" y1="37" x2="51" y2="37" stroke={stripe} strokeWidth={5} strokeLinecap="round" />
    </Svg>
  );
}

/** "ahlan" in Space Grotesk, with HSE as a volt tag. */
export function Wordmark({
  size = 'md',
  onHero = false,
}: {
  size?: 'sm' | 'md' | 'lg';
  onHero?: boolean;
}): React.JSX.Element {
  const scale = { sm: 18, md: 24, lg: 32 }[size];
  return (
    <View className="flex-row items-center gap-2">
      <Text
        tone={onHero ? 'onHero' : 'default'}
        style={{
          fontFamily: fonts.displayBold,
          fontSize: scale,
          lineHeight: scale * 1.15,
          letterSpacing: -scale * 0.045,
        }}
      >
        ahlan
      </Text>
      <View className="rounded-full bg-primary-fill px-2 py-0.5">
        <Text
          tone="onPrimary"
          style={{
            fontFamily: fonts.displayBold,
            fontSize: Math.round(scale * 0.4),
            lineHeight: Math.round(scale * 0.55),
            letterSpacing: 1,
          }}
        >
          HSE
        </Text>
      </View>
    </View>
  );
}

/**
 * The graphite hero surface: a near-black gradient, a faint instrument grid,
 * a volt glow that slowly breathes in the top corner and a violet counter-glow
 * at the bottom. It is the same dark plane in light and dark mode - the one
 * fixed point the rest of the UI is measured against.
 *
 * Drawn as SVG layers behind the content rather than with a gradient library:
 * no new native dependency, identical on iOS, Android and web.
 */
export function HeroSurface({
  children,
  className,
  style,
  glow = true,
  ...rest
}: ViewProps & { className?: string; glow?: boolean }): React.JSX.Element {
  const palette = usePalette();
  const gradientId = useSvgId('hero');
  const voltId = useSvgId('volt');
  const violetId = useSvgId('violet');
  const reduceMotion = useReducedMotion();

  // The breathing glow: a slow, barely-there pulse that makes the surface
  // feel live without ever pulling the eye from the figures on it.
  const breath = useSharedValue(0.75);
  useEffect(() => {
    if (reduceMotion || !glow) return;
    breath.value = withRepeat(
      withTiming(1, { duration: 3200, easing: Easing.inOut(Easing.sin) }),
      -1,
      true,
    );
  }, [breath, glow, reduceMotion]);
  const breathing = useAnimatedStyle(() => ({
    opacity: breath.value,
    transform: [{ scale: 0.92 + 0.08 * breath.value }],
  }));

  return (
    <View
      className={cn('overflow-hidden', className)}
      style={[{ borderWidth: 1, borderColor: palette.heroEdge }, style]}
      {...rest}
    >
      {/* The gradient may stretch to any aspect ratio... */}
      <View
        pointerEvents="none"
        style={{ position: 'absolute', top: 0, end: 0, bottom: 0, start: 0 }}
      >
        <Svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none">
          <Defs>
            <LinearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor={palette.heroFrom} />
              <Stop offset="1" stopColor={palette.heroTo} />
            </LinearGradient>
          </Defs>
          <Rect x="0" y="0" width="100" height="100" fill={`url(#${gradientId})`} />
        </Svg>
      </View>

      {/* ...the grid and glows may not: they live in fixed-size boxes so they
          stay square and round on a wide desktop banner. */}
      <View pointerEvents="none" style={{ position: 'absolute', top: 0, end: 0, width: 640, height: 640 }}>
        <Svg width="100%" height="100%" viewBox="0 0 640 640">
          <G stroke={palette.onHero} strokeOpacity={0.045} strokeWidth={1}>
            {Array.from({ length: 21 }).map((_, i) => (
              <Line key={`v${i}`} x1={i * 32} y1={0} x2={i * 32} y2={640} />
            ))}
            {Array.from({ length: 21 }).map((_, i) => (
              <Line key={`h${i}`} x1={0} y1={i * 32} x2={640} y2={i * 32} />
            ))}
          </G>
        </Svg>
      </View>

      {glow ? (
        <>
          <Animated.View
            pointerEvents="none"
            style={[{ position: 'absolute', top: -170, end: -150, width: 400, height: 400 }, breathing]}
          >
            <Svg width="100%" height="100%" viewBox="0 0 100 100">
              <Defs>
                <RadialGradient id={voltId} cx="0.5" cy="0.5" r="0.5">
                  <Stop offset="0" stopColor={palette.primaryFill} stopOpacity={0.42} />
                  <Stop offset="0.45" stopColor={palette.primaryFill} stopOpacity={0.12} />
                  <Stop offset="1" stopColor={palette.primaryFill} stopOpacity={0} />
                </RadialGradient>
              </Defs>
              <Circle cx="50" cy="50" r="50" fill={`url(#${voltId})`} />
            </Svg>
          </Animated.View>
          <View
            pointerEvents="none"
            style={{ position: 'absolute', bottom: -200, start: -160, width: 420, height: 420 }}
          >
            <Svg width="100%" height="100%" viewBox="0 0 100 100">
              <Defs>
                <RadialGradient id={violetId} cx="0.5" cy="0.5" r="0.5">
                  <Stop offset="0" stopColor={palette.accent} stopOpacity={0.3} />
                  <Stop offset="1" stopColor={palette.accent} stopOpacity={0} />
                </RadialGradient>
              </Defs>
              <Circle cx="50" cy="50" r="50" fill={`url(#${violetId})`} />
            </Svg>
          </View>
        </>
      ) : null}
      {children}
    </View>
  );
}
