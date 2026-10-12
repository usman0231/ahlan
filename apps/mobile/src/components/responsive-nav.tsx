import { useEffect } from 'react';
import { Pressable, ScrollView, View, useWindowDimensions } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { ShieldCheck } from 'lucide-react-native';
import type { Tabs } from 'expo-router';

import { Text } from './text';
import { HeroSurface } from './brand';
import { fonts, motion, radius, spacing } from '../theme/tokens';
import { usePalette } from '../theme/theme-provider';
import { useHaptics } from '../hooks/use-haptics';
import {
  activeRouteFor,
  itemsFor,
  navModeFor,
  type NavItem,
  type NavMode,
} from './responsive-nav-config';

export * from './responsive-nav-config';

/**
 * The workspace navigation, as one custom `tabBar` for expo-router's Tabs.
 *
 * Phone: the graphite floating dock (same look as the rest of the app) with
 * the phone items. Wide window (>= 1024px): a vertical graphite sidebar with
 * a brand header and workspace label, like the client mockup. The navigator
 * itself places the bar: pair this with `useResponsiveTabsOptions()`, which
 * sets `tabBarPosition` to `left` in sidebar mode.
 *
 * Reusable by any workspace: pass its own `items`, `title` and `workspaceLabel`.
 */

type TabsProps = React.ComponentProps<typeof Tabs>;
export type ResponsiveTabBarProps = Parameters<NonNullable<TabsProps['tabBar']>>[0];
type TabOptions = Exclude<NonNullable<TabsProps['screenOptions']>, (...args: never[]) => unknown>;

export const SIDEBAR_WIDTH = 248;

export function useNavMode(): NavMode {
  const { width } = useWindowDimensions();
  return navModeFor(width);
}

/** Screen options for a responsive Tabs layout. */
export function useResponsiveTabsOptions(): TabOptions {
  const palette = usePalette();
  const mode = useNavMode();
  return {
    headerShown: false,
    sceneStyle: { backgroundColor: palette.bg },
    tabBarPosition: mode === 'sidebar' ? 'left' : 'bottom',
  };
}

export function ResponsiveTabBar({
  state,
  navigation,
  items,
  title,
  workspaceLabel,
  badges,
}: ResponsiveTabBarProps & {
  items: readonly NavItem[];
  /** Sidebar brand line, e.g. "HSE Readiness". */
  title: string;
  /** Sidebar overline, e.g. "Inspector workspace". */
  workspaceLabel: string;
  /** Optional counts per route, shown as a small badge. */
  badges?: Record<string, number | undefined>;
}): React.JSX.Element {
  const mode = useNavMode();
  const focusedRoute = state.routes[state.index]?.name ?? '';
  const active = activeRouteFor(items, mode, focusedRoute);
  const visible = itemsFor(items, mode);

  const onPress = (routeName: string): void => {
    const route = state.routes.find((candidate) => candidate.name === routeName);
    if (!route) return;
    const isFocused = focusedRoute === routeName;
    const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
    if (!isFocused && !event.defaultPrevented) {
      navigation.navigate(route.name, route.params);
    }
  };

  if (mode === 'sidebar') {
    return (
      <Sidebar
        items={visible}
        active={active}
        title={title}
        workspaceLabel={workspaceLabel}
        badges={badges}
        onPress={onPress}
      />
    );
  }

  return <Dock items={visible} active={active} badges={badges} onPress={onPress} />;
}

/* --------------------------------- sidebar --------------------------------- */

function Sidebar({
  items,
  active,
  title,
  workspaceLabel,
  badges,
  onPress,
}: {
  items: NavItem[];
  active: string | null;
  title: string;
  workspaceLabel: string;
  badges?: Record<string, number | undefined>;
  onPress: (route: string) => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const palette = usePalette();
  const insets = useSafeAreaInsets();

  return (
    <HeroSurface
      glow={false}
      accessibilityRole="tablist"
      style={{
        width: SIDEBAR_WIDTH,
        height: '100%',
        borderWidth: 0,
        borderEndWidth: 1,
        borderColor: palette.heroEdge,
        paddingTop: insets.top + spacing.xl,
        paddingBottom: insets.bottom + spacing.lg,
      }}
    >
      <View className="gap-1 px-5 pb-6">
        <View className="flex-row items-center gap-2.5">
          <ShieldCheck size={22} color={palette.primaryFill} strokeWidth={2.2} />
          <Text variant="heading" tone="onHero" numberOfLines={1}>
            {title}
          </Text>
        </View>
        <Text variant="overline" tone="onHero" className="mt-4 opacity-50" numberOfLines={1}>
          {workspaceLabel}
        </Text>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: spacing.md, gap: spacing.xs }}>
        {items.map((item) => (
          <SidebarItem
            key={item.route}
            item={item}
            label={t(item.labelKey)}
            selected={active === item.route}
            badge={badges?.[item.route]}
            onPress={() => onPress(item.route)}
          />
        ))}
      </ScrollView>
    </HeroSurface>
  );
}

function SidebarItem({
  item,
  label,
  selected,
  badge,
  onPress,
}: {
  item: NavItem;
  label: string;
  selected: boolean;
  badge?: number;
  onPress: () => void;
}): React.JSX.Element {
  const palette = usePalette();
  const IconComponent = item.icon;
  const muted = `${palette.onHero}A6`;

  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      onPress={onPress}
      className="min-h-touch flex-row items-center gap-3 rounded-sm px-3"
      style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => ({
        backgroundColor: selected
          ? `${palette.onHero}14`
          : pressed || hovered
            ? `${palette.onHero}0A`
            : 'transparent',
        borderStartWidth: 3,
        borderStartColor: selected ? palette.primaryFill : 'transparent',
      })}
    >
      <IconComponent
        size={19}
        color={selected ? palette.primaryFill : muted}
        strokeWidth={selected ? 2.3 : 2}
      />
      <Text
        variant="callout"
        tone="onHero"
        numberOfLines={1}
        className="flex-1"
        style={{
          fontFamily: selected ? fonts.semibold : fonts.medium,
          opacity: selected ? 1 : 0.72,
        }}
      >
        {label}
      </Text>
      {badge ? <NavBadge count={badge} /> : null}
    </Pressable>
  );
}

/* ---------------------------------- dock ----------------------------------- */

function Dock({
  items,
  active,
  badges,
  onPress,
}: {
  items: NavItem[];
  active: string | null;
  badges?: Record<string, number | undefined>;
  onPress: (route: string) => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const palette = usePalette();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const haptics = useHaptics();

  return (
    <View
      accessibilityRole="tablist"
      className="flex-row items-center"
      style={{
        backgroundColor: palette.heroTo,
        borderWidth: 1,
        borderColor: palette.heroEdge,
        borderRadius: radius.lg + 4,
        width: Math.min(width - spacing.lg - spacing.sm, 640),
        alignSelf: 'center',
        marginBottom: Math.max(insets.bottom, spacing.md),
        marginTop: spacing.xs,
        minHeight: 70,
        paddingVertical: spacing.sm,
        paddingHorizontal: spacing.xs,
        shadowColor: palette.heroTo,
        shadowOpacity: 0.25,
        shadowRadius: 24,
        shadowOffset: { width: 0, height: 10 },
        elevation: 12,
      }}
    >
      {items.map((item) => {
        const label = t(item.shortLabelKey ?? item.labelKey);
        const selected = active === item.route;
        return (
          <Pressable
            key={item.route}
            accessibilityRole="tab"
            accessibilityLabel={t(item.labelKey)}
            accessibilityState={{ selected }}
            onPress={() => {
              if (!selected) haptics.answer();
              onPress(item.route);
            }}
            className="min-h-touch flex-1 items-center justify-center gap-1"
          >
            <DockIcon item={item} selected={selected} badge={badges?.[item.route]} />
            <Text
              numberOfLines={1}
              tone="onHero"
              style={{
                fontFamily: fonts.semibold,
                fontSize: 10,
                letterSpacing: -0.2,
                opacity: selected ? 1 : 0.55,
              }}
            >
              {label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** The volt pill that springs open behind the active dock icon. */
function DockIcon({
  item,
  selected,
  badge,
}: {
  item: NavItem;
  selected: boolean;
  badge?: number;
}): React.JSX.Element {
  const palette = usePalette();
  const progress = useSharedValue(selected ? 1 : 0);
  const IconComponent = item.icon;

  useEffect(() => {
    progress.value = withSpring(selected ? 1 : 0, motion.bouncy);
  }, [selected, progress]);

  const pill = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ scaleX: 0.4 + 0.6 * progress.value }, { scaleY: 0.7 + 0.3 * progress.value }],
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
            borderRadius: radius.full,
            backgroundColor: palette.primaryFill,
          },
          pill,
        ]}
      />
      {/* Positioned, so it paints above the absolutely positioned pill on web. */}
      <View style={{ position: 'relative' }}>
        <IconComponent
          size={21}
          color={selected ? palette.onPrimary : `${palette.onHero}8C`}
          strokeWidth={selected ? 2.3 : 2}
        />
      </View>
      {badge ? (
        <View style={{ position: 'absolute', top: -4, end: 2 }}>
          <NavBadge count={badge} />
        </View>
      ) : null}
    </View>
  );
}

function NavBadge({ count }: { count: number }): React.JSX.Element {
  return (
    <View className="min-w-[18px] items-center rounded-full bg-danger px-1.5">
      <Text tone="onHero" style={{ fontFamily: fonts.bold, fontSize: 10, lineHeight: 16 }} tabular>
        {count > 99 ? '99+' : count}
      </Text>
    </View>
  );
}
