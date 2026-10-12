import { useState } from 'react';
import { Modal, Pressable, View } from 'react-native';
import { Image } from 'expo-image';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Camera, X } from 'lucide-react-native';

import { Text } from './text';
import { usePalette } from '../theme/theme-provider';
import { useHaptics } from '../hooks/use-haptics';

export interface RemotePhoto {
  id: string;
  /** Presigned GET from the API, or a local preview for a fresh upload. */
  uri: string | null | undefined;
}

const TILE = 104;

/**
 * Photos that live on the server (presigned URLs), for review screens that
 * read the API rather than the local database. Tapping a tile opens it full
 * screen; a photo whose URL is not available yet shows a placeholder rather
 * than a broken image.
 */
export function RemotePhotoGrid({
  photos,
  onAdd,
  addLabel,
  adding = false,
}: {
  photos: RemotePhoto[];
  onAdd?: () => void;
  addLabel?: string;
  adding?: boolean;
}): React.JSX.Element {
  const { t } = useTranslation();
  const palette = usePalette();
  const haptics = useHaptics();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState<string | null>(null);

  return (
    <View className="flex-row flex-wrap gap-2">
      {photos.map((photo, index) => (
        <Pressable
          key={photo.id}
          accessibilityRole="imagebutton"
          accessibilityLabel={`${t('findings.evidence')} ${index + 1}`}
          disabled={!photo.uri}
          onPress={() => setOpen(photo.uri ?? null)}
          className="overflow-hidden rounded-md border border-card-border bg-surface-sunken"
          style={{ width: TILE, height: TILE }}
        >
          {photo.uri ? (
            <Image
              source={{ uri: photo.uri }}
              style={{ width: '100%', height: '100%' }}
              contentFit="cover"
              transition={180}
              cachePolicy="memory-disk"
              recyclingKey={photo.id}
            />
          ) : (
            <View className="flex-1 items-center justify-center">
              <Camera size={22} color={palette.fgSubtle} />
            </View>
          )}
        </Pressable>
      ))}

      {onAdd ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={addLabel ?? t('inspections.addPhoto')}
          accessibilityState={{ busy: adding, disabled: adding }}
          disabled={adding}
          onPress={() => {
            haptics.answer();
            onAdd();
          }}
          className="items-center justify-center gap-1 rounded-md border-2 border-dashed border-primary bg-primary-soft active:opacity-80"
          style={{ width: TILE, height: TILE, opacity: adding ? 0.6 : 1 }}
        >
          <Camera size={24} color={palette.primary} />
          <Text variant="caption" tone="primary" className="px-2 text-center" numberOfLines={2}>
            {adding ? t('common.loading') : (addLabel ?? t('inspections.addPhoto'))}
          </Text>
        </Pressable>
      ) : null}

      <Modal
        visible={open !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(null)}
      >
        <View
          className="flex-1"
          style={{
            backgroundColor: palette.heroTo,
            paddingTop: insets.top,
            paddingBottom: insets.bottom,
          }}
        >
          <View className="flex-row justify-end px-gutter py-2">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('common.close')}
              onPress={() => setOpen(null)}
              className="h-touch w-touch items-center justify-center rounded-full bg-surface"
            >
              <X size={22} color={palette.fg} />
            </Pressable>
          </View>
          {open ? (
            <Image
              source={{ uri: open }}
              style={{ flex: 1 }}
              contentFit="contain"
              transition={180}
            />
          ) : null}
        </View>
      </Modal>
    </View>
  );
}
