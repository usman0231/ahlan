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
import { Image } from 'expo-image';
import Svg, { Circle, Defs, G, Line, LinearGradient, RadialGradient, Rect, Stop } from 'react-native-svg';

import { Text } from './text';
import { cn } from '../utils/cn';
import { usePalette } from '../theme/theme-provider';
import { fonts } from '../theme/tokens';

/**
 * The Ahlan brand.
 *
 * The mark is the client's logo (`assets/brand/logo.png`, rendered from
 * `logo-source.jpg` by `pnpm --filter mobile brand:render`, which also
 * writes the app icon, splash and favicon). The artwork is drawn on white -
 * the ball's panels are part of it - so it always sits on a white tile, which
 * reads the same on chalk, graphite and the hero.
 */

// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro bundles static assets through require().
const logo = require('../../assets/brand/logo.png') as number;

/** SVG ids must be unique per instance and safe inside `url(#...)`. */
function useSvgId(prefix: string): string {
  return `${prefix}${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
}

/** The client's logo on its white tile. */
export function LogoMark({ size = 44 }: { size?: number }): React.JSX.Element {
  const palette = usePalette();
  return (
    <View
      accessibilityRole="image"
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.28,
        padding: size * 0.06,
        // onHero is white in every theme: the logo's own background colour.
        backgroundColor: palette.onHero,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Image source={logo} contentFit="contain" style={{ width: '100%', height: '100%' }} />
    </View>
  );
}

/**
 * "AHLAN" in Syne ExtraBold capitals, over a volt rule and a small tracked
 * "HSE": wide, sharp letterforms in the stadium-signage register the logo
 * itself speaks in.
 * Tracking is added after the last letter too, so the word is trimmed back by
 * one step to keep it optically centred on its rule.
 */
export function Wordmark({
  size = 'md',
  onHero = false,
}: {
  size?: 'sm' | 'md' | 'lg';
  onHero?: boolean;
}): React.JSX.Element {
  const palette = usePalette();
  const scale = { sm: 18, md: 24, lg: 30 }[size];
  // Syne is already wide; it needs only a breath of tracking.
  const tracking = scale * 0.04;
  const tagSize = Math.max(9, Math.round(scale * 0.4));
  // Volt reads on the graphite hero; on chalk it needs the deeper primary.
  const accent = onHero ? palette.primaryFill : palette.primary;
  return (
    <View className="gap-1">
      <Text
        tone={onHero ? 'onHero' : 'default'}
        style={{
          fontFamily: fonts.brand,
          fontSize: scale,
          lineHeight: scale * 1.1,
          letterSpacing: tracking,
          marginEnd: -tracking,
        }}
      >
        AHLAN
      </Text>
      <View className="flex-row items-center gap-2">
        <View style={{ width: scale * 0.6, height: 2, borderRadius: 1, backgroundColor: accent }} />
        <Text
          style={{
            color: accent,
            fontFamily: fonts.semibold,
            fontSize: tagSize,
            lineHeight: tagSize * 1.2,
            letterSpacing: tagSize * 0.3,
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
