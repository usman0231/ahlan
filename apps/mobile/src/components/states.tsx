import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useEffect } from 'react';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  Easing,
} from 'react-native-reanimated';

import { Text } from './text';
import { Button } from './button';
import { cn } from '../utils/cn';
import { motion } from '../theme/tokens';
import { ApiError } from '../api/client';

/**
 * The four states every screen has to handle, per the UI standards: loading,
 * empty, error and offline. Having them as components rather than inline
 * markup is what makes it practical to actually cover all four everywhere.
 */

function Centered({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}): React.JSX.Element {
  const opacity = useSharedValue(0);
  const translate = useSharedValue(8);

  useEffect(() => {
    opacity.value = withTiming(1, { duration: motion.normal, easing: Easing.out(Easing.ease) });
    translate.value = withTiming(0, { duration: motion.normal, easing: Easing.out(Easing.ease) });
  }, [opacity, translate]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translate.value }],
  }));

  return (
    // Layout on an inner View: the web renderer drops a className on an
    // Animated view, which left every empty state hugging the start edge.
    <Animated.View style={[animatedStyle, { flex: 1 }]}>
      <View className={cn('flex-1 items-center justify-center gap-3 px-gutter py-12', className)}>
        {children}
      </View>
    </Animated.View>
  );
}

export function EmptyState({
  title,
  body,
  icon,
  actionLabel,
  onAction,
}: {
  title?: string;
  body?: string;
  icon?: React.ReactNode;
  actionLabel?: string;
  onAction?: () => void;
}): React.JSX.Element {
  const { t } = useTranslation();

  return (
    <Centered>
      {icon ? (
        <View className="mb-2 h-16 w-16 items-center justify-center rounded-full bg-primary-soft">
          {icon}
        </View>
      ) : null}
      <Text variant="heading" className="text-center">
        {title ?? t('states.emptyTitle')}
      </Text>
      <Text variant="callout" tone="muted" className="max-w-[300px] text-center">
        {body ?? t('states.emptyBody')}
      </Text>
      {actionLabel && onAction ? (
        <View className="mt-2 w-full max-w-[260px]">
          <Button label={actionLabel} onPress={onAction} variant="secondary" />
        </View>
      ) : null}
    </Centered>
  );
}

/**
 * Error state.
 *
 * A network failure is shown as "offline", not as an error: offline is normal
 * in a stadium and the inspector's work is safely on the device, so the copy
 * must not imply anything was lost.
 */
export function ErrorState({
  error,
  onRetry,
}: {
  error?: unknown;
  onRetry?: () => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const apiError = error instanceof ApiError ? error : null;

  if (apiError?.isOffline) {
    return <OfflineState onRetry={onRetry} />;
  }

  return (
    <Centered>
      <Text variant="heading" tone="danger" className="text-center">
        {t('states.errorTitle')}
      </Text>
      <Text variant="callout" tone="muted" className="max-w-[300px] text-center">
        {apiError ? t(apiError.translationKey, { defaultValue: t('errors.UNKNOWN') }) : t('states.errorBody')}
      </Text>
      {onRetry ? (
        <View className="mt-2 w-full max-w-[260px]">
          <Button label={t('common.retry')} onPress={onRetry} variant="secondary" />
        </View>
      ) : null}
    </Centered>
  );
}

export function OfflineState({ onRetry }: { onRetry?: () => void }): React.JSX.Element {
  const { t } = useTranslation();

  return (
    <Centered>
      <Text variant="heading" className="text-center">
        {t('states.offlineTitle')}
      </Text>
      <Text variant="callout" tone="muted" className="max-w-[320px] text-center">
        {t('states.offlineBody')}
      </Text>
      {onRetry ? (
        <View className="mt-2 w-full max-w-[260px]">
          <Button label={t('common.retry')} onPress={onRetry} variant="secondary" />
        </View>
      ) : null}
    </Centered>
  );
}

/** Inline error, for a field or a card rather than a whole screen. */
export function InlineError({
  message,
  className,
}: {
  message: string;
  className?: string;
}): React.JSX.Element {
  return (
    <View className={cn('flex-row gap-2 rounded-sm bg-danger-soft px-3 py-2', className)}>
      <Text variant="caption" tone="danger" className="flex-1">
        {message}
      </Text>
    </View>
  );
}
