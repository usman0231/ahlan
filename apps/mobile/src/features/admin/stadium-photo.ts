import { Platform } from 'react-native';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { File } from 'expo-file-system';
import type { PresignStadiumImageResponse, Stadium } from '@ahlan/shared';

import { api, uploadToPresignedUrl } from '../../api/client';
import { fitWithin, JPEG_QUALITY } from '../evidence/resize';
import { MAX_STADIUM_PHOTO_BYTES, stadiumPhotoProblem } from './stadium-photo-rules';

export { MAX_STADIUM_PHOTO_BYTES, stadiumPhotoProblem } from './stadium-photo-rules';

/**
 * Uploading a stadium photo, online (an administrator editing a venue is by
 * definition connected).
 *
 * The same pipeline as evidence, minus the offline queue: decode, shrink to
 * the evidence target (1600px long edge, JPEG 0.7) so a 12 MP phone photo
 * becomes a few hundred KB, presign, PUT straight to object storage, then
 * attach the key to the stadium. The bytes never pass through the API server.
 */

export interface CompressedPhoto {
  uri: string;
  body: Uint8Array;
  width: number;
  height: number;
}

export interface StadiumPhotoDeps {
  compress: (sourceUri: string) => Promise<CompressedPhoto>;
  presign: (
    stadiumId: string,
    input: { contentType: 'image/jpeg'; sizeBytes: number },
  ) => Promise<PresignStadiumImageResponse>;
  put: (input: {
    uploadUrl: string;
    headers: Record<string, string>;
    body: Uint8Array;
  }) => Promise<void>;
  attach: (stadiumId: string, objectKey: string) => Promise<Stadium>;
}

export class StadiumPhotoError extends Error {
  constructor(readonly problem: 'tooLarge' | 'empty') {
    super(`Stadium photo rejected: ${problem}`);
    this.name = 'StadiumPhotoError';
  }
}

async function readBytes(uri: string): Promise<Uint8Array> {
  if (Platform.OS === 'web') {
    const response = await fetch(uri);
    return new Uint8Array(await response.arrayBuffer());
  }
  return new File(uri).bytes();
}

async function compressPhoto(sourceUri: string): Promise<CompressedPhoto> {
  const original = await ImageManipulator.manipulate(sourceUri).renderAsync();
  const target = fitWithin(original.width, original.height);
  const rendered = target
    ? await ImageManipulator.manipulate(sourceUri).resize(target).renderAsync()
    : original;
  const saved = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: JPEG_QUALITY });
  return {
    uri: saved.uri,
    body: await readBytes(saved.uri),
    width: saved.width,
    height: saved.height,
  };
}

const defaultDeps: StadiumPhotoDeps = {
  compress: compressPhoto,
  presign: (stadiumId, input) =>
    api.post<PresignStadiumImageResponse>(`/stadiums/${stadiumId}/image/presign`, input),
  put: (input) => uploadToPresignedUrl(input),
  attach: (stadiumId, objectKey) => api.put<Stadium>(`/stadiums/${stadiumId}/image`, { objectKey }),
};

/** Compress → presign → PUT → attach. Returns the updated stadium. */
export async function uploadStadiumPhoto(
  input: { stadiumId: string; sourceUri: string },
  deps: StadiumPhotoDeps = defaultDeps,
): Promise<{ stadium: Stadium; previewUri: string }> {
  const photo = await deps.compress(input.sourceUri);
  const problem = stadiumPhotoProblem(photo.body.byteLength);
  if (problem) throw new StadiumPhotoError(problem);

  const presigned = await deps.presign(input.stadiumId, {
    contentType: 'image/jpeg',
    sizeBytes: photo.body.byteLength,
  });
  await deps.put({ uploadUrl: presigned.uploadUrl, headers: presigned.headers, body: photo.body });
  const stadium = await deps.attach(input.stadiumId, presigned.objectKey);
  return { stadium, previewUri: photo.uri };
}

export function removeStadiumPhoto(stadiumId: string): Promise<Stadium> {
  return api.delete<Stadium>(`/stadiums/${stadiumId}/image`);
}

/** Exposed for the size check message. */
export const STADIUM_PHOTO_LIMIT_MB = Math.round(MAX_STADIUM_PHOTO_BYTES / (1024 * 1024));
