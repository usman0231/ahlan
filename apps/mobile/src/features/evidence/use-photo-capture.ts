import { useCallback, useState } from 'react';
import * as ImagePicker from 'expo-image-picker';

/**
 * Taking a photo.
 *
 * The system camera is used rather than a custom `CameraView`: it is faster to
 * open, handles focus and flash the way the inspector's phone already does, and
 * is one less surface to get wrong in bright sunlight. Compression happens
 * afterwards in `capturePhotoEvidence`.
 */
export function usePhotoCapture() {
  const [busy, setBusy] = useState(false);
  const [permissionDenied, setPermissionDenied] = useState(false);

  /** Returns the captured file's URI, or null if cancelled or refused. */
  const capture = useCallback(async (): Promise<string | null> => {
    setBusy(true);
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        setPermissionDenied(true);
        return null;
      }
      setPermissionDenied(false);

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        // Full quality here; the compression step owns the size/quality call.
        quality: 1,
        exif: false,
      });

      if (result.canceled) return null;
      return result.assets[0]?.uri ?? null;
    } finally {
      setBusy(false);
    }
  }, []);

  /** Picking an existing photo, for evidence taken before the app was open. */
  const pickFromLibrary = useCallback(async (): Promise<string | null> => {
    setBusy(true);
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        setPermissionDenied(true);
        return null;
      }
      setPermissionDenied(false);

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 1,
      });

      if (result.canceled) return null;
      return result.assets[0]?.uri ?? null;
    } finally {
      setBusy(false);
    }
  }, []);

  return { capture, pickFromLibrary, busy, permissionDenied };
}
