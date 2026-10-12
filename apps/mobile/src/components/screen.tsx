import { RefreshControl, ScrollView, View, type ScrollViewProps } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCallback, useState } from 'react';

import { Text } from './text';
import { OfflineBanner } from './offline-banner';
import { cn } from '../utils/cn';
import { usePalette } from '../theme/theme-provider';
import { useManualSync } from '../hooks/use-sync';

export interface ScreenProps extends Omit<ScrollViewProps, 'children'> {
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
  /** Right-hand side of the header, e.g. a filter button. */
  headerAction?: React.ReactNode;
  /** Scrolls the content. Turn off for a screen that hosts its own list. */
  scroll?: boolean;
  /** Pull-to-refresh runs a sync pass as well as the supplied refresh. */
  onRefresh?: () => void | Promise<void>;
  /** Hides the offline banner on screens where it would be noise. */
  hideOfflineBanner?: boolean;
  /** Pinned to the bottom above the safe area, e.g. a submit bar. */
  footer?: React.ReactNode;
  /** Dashboard-style screens get a wider column on large viewports. */
  wide?: boolean;
  contentClassName?: string;
}

/** One phone-width column, centred, however wide the window gets. */
const COLUMN = 600;
const COLUMN_WIDE = 840;

/**
 * The page shell.
 *
 * Every screen goes through here, which is how the offline banner, safe-area
 * padding, pull-to-refresh and the responsive centre column end up genuinely
 * present on all of them rather than on the ones somebody remembered. The
 * column cap is what makes the same screens hold together in a desktop
 * browser instead of stretching a phone layout across the whole window.
 */
export function Screen({
  children,
  title,
  subtitle,
  headerAction,
  scroll = true,
  onRefresh,
  hideOfflineBanner = false,
  footer,
  wide = false,
  contentClassName,
  ...rest
}: ScreenProps): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const palette = usePalette();
  const { sync } = useManualSync();
  const [refreshing, setRefreshing] = useState(false);

  const column = {
    width: '100%' as const,
    maxWidth: wide ? COLUMN_WIDE : COLUMN,
    alignSelf: 'center' as const,
  };

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      // A manual pull means "get me up to date", so it syncs as well as
      // refetching whatever the screen asked for.
      await Promise.all([sync(), onRefresh?.()]);
    } finally {
      setRefreshing(false);
    }
  }, [sync, onRefresh]);

  const header =
    title || headerAction ? (
      <View style={column}>
        {/* Large-title header. The kicker (a date or a period) and the action
            share the top row, so the title below always has the full width
            and never breaks mid-word beside a button. */}
        <View className="gap-1 px-gutter pb-5 pt-4">
          {subtitle || headerAction ? (
            <View
              className={cn(
                'flex-row items-center justify-between gap-3',
                headerAction ? 'min-h-touch' : undefined,
              )}
            >
              <Text variant="caption" tone="muted" numberOfLines={1} className="flex-1">
                {subtitle ?? ''}
              </Text>
              {headerAction}
            </View>
          ) : null}
          {title ? (
            <Text variant="display" numberOfLines={2}>
              {title}
            </Text>
          ) : null}
        </View>
      </View>
    ) : null;

  const content = (
    <View className={cn('flex-1', contentClassName)} style={column}>
      {children}
    </View>
  );

  return (
    <View className="flex-1 bg-bg" style={{ paddingTop: insets.top }}>
      {hideOfflineBanner ? null : <OfflineBanner />}
      {header}

      {scroll ? (
        <ScrollView
          className="flex-1"
          contentContainerStyle={{
            paddingHorizontal: 20,
            paddingBottom: (footer ? 16 : insets.bottom + 24) + 8,
            flexGrow: 1,
          }}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            onRefresh ? (
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => void handleRefresh()}
                tintColor={palette.primary}
                colors={[palette.primary]}
              />
            ) : undefined
          }
          {...rest}
        >
          {content}
        </ScrollView>
      ) : (
        content
      )}

      {footer ? (
        <View
          className="rounded-t-xl border-t border-card-border bg-surface"
          style={{ paddingBottom: Math.max(insets.bottom, 12) }}
        >
          <View className="px-gutter pt-3" style={column}>
            {footer}
          </View>
        </View>
      ) : null}
    </View>
  );
}
