import { useEffect } from 'react';
import { useWindowDimensions, View, type ColorValue } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Tabs } from 'expo-router';

import { Icon, type IconName } from './icon';
import { fonts, motion } from '../theme/tokens';
import { usePalette } from '../theme/theme-provider';

/**
 * A tab-bar icon with a volt pill that springs open behind the active tab.
 * The pill is styled inline because the web renderer drops a className on an
 * Animated view.
 */
export function TabIcon({
  name,
  color,
  focused,
}: {
  name: IconName;
  /** Navigators hand over a ColorValue, which may be opaque. */
  color: ColorValue;
  focused: boolean;
}): React.JSX.Element {
  const palette = usePalette();
  const progress = useSharedValue(focused ? 1 : 0);

  useEffect(() => {
    progress.value = withSpring(focused ? 1 : 0, motion.bouncy);
  }, [focused, progress]);

  const pill = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ scaleX: 0.4 + 0.6 * progress.value }, { scaleY: 0.7 + 0.3 * progress.value }],
  }));

  const glyph = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + 0.06 * progress.value }],
  }));

  return (
    <View style={{ width: 52, height: 32, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View
        style={[
          {
            position: 'absolute',
            top: 0,
            end: 0,
            bottom: 0,
            start: 0,
            borderRadius: 16,
            backgroundColor: palette.primaryFill,
          },
          pill,
        ]}
      />
      <Animated.View style={glyph}>
        {/* Graphite on the volt pill; the navigator's tint everywhere else. */}
        <Icon name={name} color={focused ? palette.onPrimary : color} size={21} strokeWidth={focused ? 2.3 : 2} />
      </Animated.View>
    </View>
  );
}

/**
 * The floating dock both workspaces use: a graphite capsule hovering above
 * the content, identical in light and dark mode, the same plane as the hero.
 *
 * It stays in layout flow (not absolutely positioned), so no screen has to
 * pad itself to clear it, and a screen's own footer still sits above it.
 */
type TabOptions = Exclude<
  NonNullable<React.ComponentProps<typeof Tabs>['screenOptions']>,
  (...args: never[]) => unknown
>;

export function useDockOptions(): TabOptions {
  const palette = usePalette();
  const insets = useSafeAreaInsets();
  const window = useWindowDimensions();

  return {
    headerShown: false,
    tabBarActiveTintColor: palette.onHero,
    tabBarInactiveTintColor: `${palette.onHero}8C`,
    sceneStyle: { backgroundColor: palette.bg },
    // Always stacked: side-by-side labels (the wide-screen default) would sit
    // under the volt pill.
    tabBarLabelPosition: 'below-icon',
    tabBarStyle: {
      backgroundColor: palette.heroTo,
      borderTopWidth: 0,
      borderWidth: 1,
      borderColor: palette.heroEdge,
      borderRadius: 28,
      // A dock, not a footer: inset 12dp on a phone, phone-sized and centred
      // on a tablet or desktop.
      width: Math.min(window.width - 24, 640),
      alignSelf: 'center',
      marginBottom: Math.max(insets.bottom, 12),
      marginTop: 4,
      // Comfortable for a thumb, and clears the 48dp minimum.
      height: 70,
      paddingTop: 9,
      paddingBottom: 9,
      shadowColor: palette.heroTo,
      shadowOpacity: 0.25,
      shadowRadius: 24,
      shadowOffset: { width: 0, height: 10 },
      elevation: 12,
    },
    tabBarBadgeStyle: {
      backgroundColor: palette.danger,
      color: palette.onHero,
      fontFamily: fonts.bold,
      fontSize: 10,
    },
    // Tight enough that "Dashboard" fits six-across on a 360dp phone.
    tabBarLabelStyle: { fontSize: 10, fontFamily: fonts.semibold, letterSpacing: -0.2, marginTop: 2 },
    tabBarItemStyle: { borderRadius: 22, paddingHorizontal: 0 },
  };
}
