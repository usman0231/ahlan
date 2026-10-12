import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { Image } from 'expo-image';
import { useTranslation } from 'react-i18next';

import { Text } from './text';
import { SyncBadge } from './badge';
import { Skeleton } from './skeleton';
import { Icon } from './icon';
import { cn } from '../utils/cn';
import { useHaptics } from '../hooks/use-haptics';
import { useSyncStore } from '../store/sync';
import type { EvidenceModel } from '../db/models/evidence';
import { useEvidenceImage } from '../features/evidence/use-evidence-image';
import { retryFailedEvidence, uploadErrorCode } from '../features/evidence/upload-queue';
import { refreshFailedUploads } from '../db/sync';

/**
 * The photo row under a checklist answer, an observation or a closure.
 *
 * Each thumbnail shows its own sync state (saved on device / syncing / failed).
 * A failed photo is a tap-to-retry button and says why it failed. Uploaded
 * photos render from a presigned GET once the local copy is freed, with a
 * skeleton while the URL loads.
 */
export function PhotoStrip({
  photos,
  onAdd,
  onRemove,
  onPress,
  required = false,
  disabled = false,
  className,
}: {
  photos: EvidenceModel[];
  onAdd?: () => void;
  onRemove?: (photo: EvidenceModel) => void;
  onPress?: (photo: EvidenceModel) => void;
  /** Draws attention to the empty state when a photo is mandatory. */
  required?: boolean;
  disabled?: boolean;
  className?: string;
}): React.JSX.Element {
  const { t } = useTranslation();
  const haptics = useHaptics();
  const [retrying, setRetrying] = useState(false);

  const failed = photos.filter((photo) => photo.uploadStatus === 'FAILED');
  const failedCode = uploadErrorCode(failed[0]?.uploadError ?? null);

  async function retry(photo: EvidenceModel): Promise<void> {
    if (retrying) return;
    setRetrying(true);
    haptics.answer();
    try {
      const summary = await retryFailedEvidence([photo.id]);
      if (summary.uploaded > 0) haptics.success();
      else haptics.error();
    } finally {
      await refreshFailedUploads().catch(() => 0);
      setRetrying(false);
    }
  }

  return (
    <View className={cn('gap-2', className)}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 8 }}
      >
        {photos.map((photo) => {
          const isFailed = photo.uploadStatus === 'FAILED';
          return (
            <Pressable
              key={photo.id}
              accessibilityRole={isFailed ? 'button' : 'imagebutton'}
              accessibilityLabel={
                isFailed ? t('evidence.tapToRetry') : (photo.caption ?? t('findings.evidence'))
              }
              testID={isFailed ? 'Retry photo' : undefined}
              onPress={() => (isFailed ? void retry(photo) : onPress?.(photo))}
              onLongPress={disabled ? undefined : () => onRemove?.(photo)}
              className={cn(
                'relative h-20 w-20 overflow-hidden rounded-sm border bg-surface-sunken',
                isFailed ? 'border-danger' : 'border-border',
              )}
            >
              <Thumbnail photo={photo} />
              <View className="absolute bottom-1 start-1">
                <PhotoSyncBadge photo={photo} retrying={retrying && isFailed} />
              </View>
            </Pressable>
          );
        })}

        {onAdd && !disabled ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('inspections.addPhoto')}
            testID="Add photo"
            onPress={onAdd}
            className={cn(
              'h-20 w-20 items-center justify-center rounded-sm border-2 border-dashed',
              required && photos.length === 0 ? 'border-danger bg-danger-soft' : 'border-border',
            )}
          >
            <Text variant="title" tone={required && photos.length === 0 ? 'danger' : 'muted'}>
              +
            </Text>
          </Pressable>
        ) : null}
      </ScrollView>

      {failed.length > 0 ? (
        <Text variant="caption" tone="danger" accessibilityLiveRegion="polite">
          {t(`evidence.errors.${failedCode}`, { defaultValue: t('evidence.errors.UNKNOWN') })}{' '}
          {t('evidence.tapToRetry')}
        </Text>
      ) : photos.length > 0 ? (
        <Text variant="caption" tone="subtle">
          {t('inspections.photoCount', { count: photos.length })}
        </Text>
      ) : null}
    </View>
  );
}

function PhotoSyncBadge({
  photo,
  retrying,
}: {
  photo: EvidenceModel;
  retrying: boolean;
}): React.JSX.Element | null {
  const syncing = useSyncStore((state) => state.status === 'syncing');
  if (photo.uploadStatus === 'UPLOADED') return null;
  if (retrying) return <SyncBadge state="SYNCING" />;
  if (photo.uploadStatus === 'FAILED') return <SyncBadge state="FAILED" />;
  return <SyncBadge state={syncing ? 'SYNCING' : 'LOCAL'} />;
}

/**
 * Local file first; once that is freed, the presigned remote image. The last
 * local URI is held until the remote image has actually loaded, so the swap
 * never shows an empty tile.
 */
function Thumbnail({ photo }: { photo: EvidenceModel }): React.JSX.Element {
  const { t } = useTranslation();
  const localUri = photo.localUri;
  const [lastLocal, setLastLocal] = useState<string | null>(localUri);
  const [remoteLoaded, setRemoteLoaded] = useState(false);
  // Remember the latest local URI (state adjusted during render, not an effect).
  if (localUri && localUri !== lastLocal) setLastLocal(localUri);

  const remote = useEvidenceImage({
    id: photo.id,
    uploaded: photo.uploadStatus === 'UPLOADED',
    hasLocalCopy: Boolean(localUri),
  });

  const fallbackLocal = localUri ?? (remoteLoaded ? null : lastLocal);

  return (
    <View className="flex-1">
      {remote.url ? (
        <Image
          source={{ uri: remote.url, cacheKey: `evidence-${photo.id}` }}
          style={{ position: 'absolute', top: 0, bottom: 0, start: 0, end: 0 }}
          contentFit="cover"
          transition={120}
          cachePolicy="disk"
          onLoad={() => setRemoteLoaded(true)}
          // An expired or revoked URL: ask the API for a fresh one.
          onError={() => remote.refresh()}
        />
      ) : null}

      {fallbackLocal ? (
        <Image
          source={{ uri: fallbackLocal }}
          style={{ position: 'absolute', top: 0, bottom: 0, start: 0, end: 0 }}
          contentFit="cover"
          transition={120}
          // Already a compressed local file; no need to cache a copy.
          cachePolicy="none"
        />
      ) : remote.loading ? (
        <Skeleton height={80} width="100%" rounded="xs" />
      ) : !remote.url ? (
        <View
          className="flex-1 items-center justify-center gap-1"
          accessibilityLabel={remote.unavailable ? t('evidence.unavailable') : undefined}
        >
          <Icon name="camera" tone="muted" />
          {remote.unavailable ? (
            <Text variant="overline" tone="subtle">
              {t('evidence.unavailable')}
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
