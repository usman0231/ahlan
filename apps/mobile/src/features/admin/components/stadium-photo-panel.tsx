import { useState } from 'react';
import { Platform, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Camera, ImagePlus, Trash2 } from 'lucide-react-native';
import type { Stadium } from '@ahlan/shared';

import { Button } from '../../../components/button';
import { Card } from '../../../components/card';
import { InlineError } from '../../../components/states';
import { Text } from '../../../components/text';
import { StadiumPhotoHeader } from '../../../components/stadium-card';
import { usePalette } from '../../../theme/theme-provider';
import { usePhotoCapture } from '../../evidence/use-photo-capture';
import { ApiError } from '../../../api/client';
import { confirmDialog } from '../../../utils/dialogs';
import { useRemoveStadiumPhoto, useUploadStadiumPhoto } from '../manage-hooks';
import { STADIUM_PHOTO_LIMIT_MB, StadiumPhotoError } from '../stadium-photo';

/**
 * Upload, replace or remove a stadium's photo (administrator).
 *
 * The preview is the real card header, so the administrator sees exactly what
 * every stadium card will show. With no upload the bundled photo for the code
 * (or the branded placeholder) is what remains.
 */
export function StadiumPhotoPanel({ stadium }: { stadium: Stadium }): React.JSX.Element {
  const { t } = useTranslation();
  const palette = usePalette();
  const picker = usePhotoCapture();
  const upload = useUploadStadiumPhoto();
  const remove = useRemoveStadiumPhoto();
  const [error, setError] = useState<string | null>(null);
  const hasUpload = Boolean(stadium.imageUrl);
  const busy = upload.isPending || remove.isPending || picker.busy;

  async function choose(source: 'library' | 'camera'): Promise<void> {
    setError(null);
    const uri = source === 'camera' ? await picker.capture() : await picker.pickFromLibrary();
    if (!uri) {
      if (picker.permissionDenied) setError(t('stadiums.photo.permission'));
      return;
    }
    upload.mutate(
      { stadiumId: stadium.id, sourceUri: uri },
      {
        onError: (failure) =>
          setError(
            failure instanceof StadiumPhotoError
              ? t(`stadiums.photo.${failure.problem}`, { mb: STADIUM_PHOTO_LIMIT_MB })
              : failure instanceof ApiError
                ? t(failure.translationKey, { defaultValue: t('stadiums.photo.failed') })
                : t('stadiums.photo.failed'),
          ),
      },
    );
  }

  function confirmRemove(): void {
    confirmDialog({
      title: t('stadiums.photo.removeTitle'),
      message: t('stadiums.photo.removeBody', { name: stadium.name }),
      confirmLabel: t('stadiums.photo.remove'),
      cancelLabel: t('common.cancel'),
      destructive: true,
      onConfirm: () =>
        remove.mutate(stadium.id, {
          onError: () => setError(t('stadiums.photo.failed')),
        }),
    });
  }

  return (
    <Card className="gap-4">
      <View className="gap-1">
        <Text variant="heading">{t('stadiums.photo.title')}</Text>
        <Text variant="caption" tone="muted">
          {hasUpload ? t('stadiums.photo.uploaded') : t('stadiums.photo.bundled')}
        </Text>
      </View>
      <StadiumPhotoHeader
        code={stadium.code}
        name={stadium.name}
        city={stadium.city}
        imageUrl={stadium.imageUrl}
        inactive={!stadium.isActive}
        height={170}
        rounded="all"
      />
      {upload.isPending ? (
        <Text variant="caption" tone="muted" accessibilityLiveRegion="polite">
          {t('stadiums.photo.uploading')}
        </Text>
      ) : null}
      {error ? <InlineError message={error} /> : null}
      <View className="gap-3">
        <View>
          <Button
            label={hasUpload ? t('stadiums.photo.replace') : t('stadiums.photo.upload')}
            variant="secondary"
            icon={<ImagePlus size={18} color={palette.primary} />}
            loading={upload.isPending}
            disabled={busy}
            onPress={() => void choose('library')}
          />
        </View>
        {Platform.OS !== 'web' ? (
          <View>
            <Button
              label={t('stadiums.photo.camera')}
              variant="secondary"
              icon={<Camera size={18} color={palette.primary} />}
              disabled={busy}
              onPress={() => void choose('camera')}
            />
          </View>
        ) : null}
        {hasUpload ? (
          <View>
            <Button
              label={t('stadiums.photo.remove')}
              variant="ghost"
              icon={<Trash2 size={18} color={palette.danger} />}
              loading={remove.isPending}
              disabled={busy}
              onPress={confirmRemove}
            />
          </View>
        ) : null}
      </View>
      <Text variant="caption" tone="subtle">
        {t('stadiums.photo.hint', { mb: STADIUM_PHOTO_LIMIT_MB })}
      </Text>
    </Card>
  );
}
