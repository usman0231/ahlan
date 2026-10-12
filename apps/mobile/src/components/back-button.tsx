import { Pressable, View } from 'react-native';
import { router, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';

import { Text } from './text';
import { usePalette } from '../theme/theme-provider';
import { useHaptics } from '../hooks/use-haptics';

/**
 * Back pill for pushed screens in the review workspace.
 *
 * The chevron follows the reading direction, and a deep link with no history
 * falls back to a sensible parent instead of doing nothing.
 */
export function BackButton({
  label,
  fallback,
}: {
  label?: string;
  fallback: Href;
}): React.JSX.Element {
  const { t, i18n } = useTranslation();
  const palette = usePalette();
  const haptics = useHaptics();
  const rtl = i18n.dir() === 'rtl';
  const Chevron = rtl ? ChevronRight : ChevronLeft;
  const text = label ?? t('common.back');

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={text}
      hitSlop={8}
      onPress={() => {
        haptics.answer();
        if (router.canGoBack()) router.back();
        else router.replace(fallback);
      }}
      className="h-touch flex-row items-center gap-1 rounded-full bg-surface pe-4 ps-2 active:bg-surface-sunken"
    >
      <Chevron size={20} color={palette.fg} strokeWidth={2.2} />
      <Text variant="callout" numberOfLines={1}>
        {text}
      </Text>
    </Pressable>
  );
}

/**
 * The header row of a pushed screen: back at the start, actions at the end.
 *
 * Passed as a `Screen` `headerAction` with no `subtitle`; it claims the whole
 * row (the empty subtitle slot shrinks to nothing), which is what puts the
 * back pill on the leading edge where a thumb expects it.
 */
export function HeaderBar({
  backLabel,
  fallback,
  children,
}: {
  backLabel?: string;
  fallback: Href;
  /** End-side actions, e.g. a primary "New" button. */
  children?: React.ReactNode;
}): React.JSX.Element {
  return (
    // -ms-3 cancels the header row gap left by the empty subtitle slot.
    <View
      className="-ms-3 flex-row items-center justify-between gap-3"
      style={{ flexGrow: 1000, flexShrink: 0, flexBasis: 'auto' }}
    >
      <BackButton label={backLabel} fallback={fallback} />
      {children ? <View className="flex-row items-center gap-2">{children}</View> : null}
    </View>
  );
}
