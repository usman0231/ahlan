import { Pressable, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { useEffect } from 'react';

import { Text } from './text';
import { Ping } from './motion';
import { usePalette } from '../theme/theme-provider';
import { motion } from '../theme/tokens';
import { formatLocalTime } from '../utils/format';
import { useSettingsStore } from '../store/settings';
import { useSyncStore } from '../store/sync';
import { useManualSync } from '../hooks/use-sync';
import { retryFailedEvidence } from '../features/evidence/upload-queue';

/**
 * The connection and sync banner.
 *
 * Shown only when there is something to say: offline, syncing, items queued, or
 * a sync that failed. An inspector working normally with a good connection sees
 * nothing, which is what makes the banner meaningful when it does appear.
 */
export function OfflineBanner(): React.JSX.Element | null {
  const { t } = useTranslation();
  const online = useSyncStore((state) => state.online);
  const status = useSyncStore((state) => state.status);
  const pendingCount = useSyncStore((state) => state.pendingCount);
  const failedUploads = useSyncStore((state) => state.failedUploads);
  const { sync, syncing } = useManualSync();
  const palette = usePalette();

  const visible =
    !online || status === 'syncing' || status === 'error' || pendingCount > 0 || failedUploads > 0;

  const height = useSharedValue(visible ? 1 : 0);

  useEffect(() => {
    height.value = withTiming(visible ? 1 : 0, {
      duration: motion.normal,
      easing: Easing.inOut(Easing.ease),
    });
  }, [visible, height]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: height.value,
    maxHeight: height.value * 64,
  }));

  if (!visible) return null;

  const { label, tone } = describe();

  function describe(): { label: string; tone: 'warning' | 'info' | 'danger' } {
    if (!online) return { label: t('states.offlineBanner'), tone: 'warning' };
    if (status === 'syncing') return { label: t('states.syncingBanner'), tone: 'info' };
    if (status === 'error') return { label: t('sync.failed'), tone: 'danger' };
    // A photo that failed to upload must never look like a finished sync.
    if (failedUploads > 0) {
      return { label: t('evidence.failedBanner', { count: failedUploads }), tone: 'danger' };
    }
    return {
      label: t('states.pendingBanner', { count: pendingCount }),
      tone: 'info',
    };
  }

  const background =
    tone === 'warning' ? 'bg-warning-soft' : tone === 'danger' ? 'bg-danger-soft' : 'bg-info-soft';
  const textTone = tone === 'warning' ? 'warning' : tone === 'danger' ? 'danger' : 'default';
  const dot = tone === 'warning' ? palette.warning : tone === 'danger' ? palette.danger : palette.info;

  return (
    <Animated.View style={animatedStyle}>
      {/* A floating status pill rather than a full-bleed strip: it reads as
          information about the app, not as part of the page. */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        // Tapping the banner retries, which is the obvious thing to want.
        onPress={() =>
          void (async () => {
            // Failed photos get a fresh set of attempts before the pass.
            if (failedUploads > 0) await retryFailedEvidence().catch(() => undefined);
            await sync();
          })()
        }
        disabled={syncing || !online}
        className={`mx-gutter mt-2 flex-row items-center justify-between gap-3 rounded-full px-4 py-2.5 ${background}`}
      >
        <Ping color={dot} size={8} />
        <Text variant="caption" tone={textTone} className="flex-1">
          {label}
        </Text>
        {online && status !== 'syncing' ? (
          <Text variant="caption" tone="primary">
            {t('sync.syncNow')}
          </Text>
        ) : null}
      </Pressable>
    </Animated.View>
  );
}

/** The "last synced 4m ago" line for the Settings screen. */
export function SyncStatusLine(): React.JSX.Element {
  const { t } = useTranslation();
  const locale = useSettingsStore((state) => state.locale);
  const lastSyncedAt = useSyncStore((state) => state.lastSyncedAt);
  const pendingCount = useSyncStore((state) => state.pendingCount);

  return (
    <View className="gap-1">
      <Text variant="caption" tone="muted">
        {t('sync.lastSynced', {
          when: lastSyncedAt ? formatLocalTime(lastSyncedAt, locale) : t('sync.never'),
        })}
      </Text>
      {pendingCount > 0 ? (
        <Text variant="caption" tone="warning">
          {t('states.pendingBanner', { count: pendingCount })}
        </Text>
      ) : null}
    </View>
  );
}
