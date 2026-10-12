import { Pressable, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';

import { Text } from './text';
import { CountBadge } from './badge';
import { cn } from '../utils/cn';
import { elevation, motion, radius } from '../theme/tokens';
import { usePalette } from '../theme/theme-provider';
import { useHaptics } from '../hooks/use-haptics';

/**
 * A navigation row for hub screens (the admin "Manage" tab): icon well,
 * title, one line of context, an optional count and a direction-aware chevron.
 */
export function NavTile({
  title,
  description,
  icon,
  count,
  onPress,
  tone = 'default',
}: {
  title: string;
  description?: string;
  icon: React.ReactNode;
  /** Shown as a red count, e.g. pending access requests. */
  count?: number;
  onPress: () => void;
  /** `accent` puts the icon on violet, for AI. */
  tone?: 'default' | 'accent';
}): React.JSX.Element {
  const { i18n } = useTranslation();
  const palette = usePalette();
  const haptics = useHaptics();
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const Chevron = i18n.dir() === 'rtl' ? ChevronLeft : ChevronRight;

  return (
    <Animated.View style={[animatedStyle, elevation.card, { borderRadius: radius.lg }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={title}
        onPressIn={() => (scale.value = withSpring(0.985, motion.spring))}
        onPressOut={() => (scale.value = withSpring(1, motion.spring))}
        onPress={() => {
          haptics.answer();
          onPress();
        }}
        className="min-h-[76px] flex-row items-center gap-4 rounded-lg border border-card-border bg-surface px-4 py-3 active:bg-surface-sunken"
      >
        <View
          className={cn(
            'h-12 w-12 items-center justify-center rounded-md',
            tone === 'accent' ? 'bg-accent-soft' : 'bg-primary-soft',
          )}
        >
          {icon}
        </View>
        <View className="flex-1 gap-0.5">
          <Text variant="heading" numberOfLines={1}>
            {title}
          </Text>
          {description ? (
            <Text variant="caption" tone="muted" numberOfLines={2}>
              {description}
            </Text>
          ) : null}
        </View>
        {count ? <CountBadge count={count} /> : null}
        <Chevron size={20} color={palette.fgSubtle} />
      </Pressable>
    </Animated.View>
  );
}
