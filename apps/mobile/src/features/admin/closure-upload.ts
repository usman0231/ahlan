import { Platform } from 'react-native';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { File } from 'expo-file-system';
import { uuidv7, type Evidence, type PresignEvidenceResponse } from '@ahlan/shared';

import { api, uploadToPresignedUrl } from '../../api/client';
import { JPEG_QUALITY, MAX_DIMENSION } from '../evidence/capture';

/**
 * Closure evidence for a reviewer, uploaded online.
 *
 * The inspector pipeline queues photos in WatermelonDB for later; an
 * administrator closing an action is by definition online (the close itself is
 * a server call), so the photo goes straight up: compress on device with the
 * same targets as the field pipeline, presign, PUT to object storage, confirm.
 * The bytes never pass through the API server.
 */

export interface UploadedClosurePhoto {
  id: string;
  /** The compressed local copy, shown as the preview until the screen refetches. */
  previewUri: string;
}

async function readBytes(uri: string): Promise<Uint8Array> {
  if (Platform.OS === 'web') {
    const response = await fetch(uri);
    return new Uint8Array(await response.arrayBuffer());
  }
  return new File(uri).bytes();
}

export async function uploadClosurePhoto(input: {
  sourceUri: string;
  actionId: string;
  stadiumId: string;
}): Promise<UploadedClosurePhoto> {
  const id = uuidv7();

  const rendered = await ImageManipulator.manipulate(input.sourceUri)
    .resize({ width: MAX_DIMENSION })
    .renderAsync();
  const compressed = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: JPEG_QUALITY });
  const body = await readBytes(compressed.uri);

  const presigned = await api.post<PresignEvidenceResponse>('/evidence/presign', {
    id,
    kind: 'PHOTO',
    context: 'CORRECTIVE_ACTION_CLOSURE',
    contextId: input.actionId,
    stadiumId: input.stadiumId,
    contentType: 'image/jpeg',
    sizeBytes: body.byteLength,
    width: compressed.width,
    height: compressed.height,
    capturedAt: new Date().toISOString(),
  });

  await uploadToPresignedUrl({ uploadUrl: presigned.uploadUrl, headers: presigned.headers, body });
  await api.post<Evidence>(`/evidence/${id}/complete`, { sizeBytes: body.byteLength });

  return { id, previewUri: compressed.uri };
}
