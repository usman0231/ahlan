import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { uuidv7, type EvidenceContext } from '@ahlan/shared';

import { collections, database } from '../../db';
import type { EvidenceModel } from '../../db/models/evidence';
import { getCurrentPosition } from '../../hooks/use-location';
import { deleteLocalFile, NEEDS_BASE64, persistCompressed } from './local-files';
import { fitWithin, JPEG_QUALITY } from './resize';

export { MAX_DIMENSION, JPEG_QUALITY } from './resize';
export { deleteLocalFile, readLocalFile, localEvidenceBytes } from './local-files';

export interface CaptureResult {
  evidence: EvidenceModel;
  localUri: string;
}

/**
 * Compresses a captured photo, stores it on the device and writes the evidence
 * row.
 *
 * The row is created immediately with `uploadStatus: 'PENDING'`, so the photo
 * exists in the database the instant the shutter closes, whether or not there
 * is any signal. The upload queue picks it up later.
 *
 * Throws when the image cannot be read or encoded; callers show that error.
 */
export async function capturePhotoEvidence(input: {
  sourceUri: string;
  context: EvidenceContext;
  contextId: string | null;
  stadiumId: string;
  caption?: string | null;
  /** Skip the GPS read when the caller already has a fix. */
  gps?: { latitude: number; longitude: number; accuracyM: number | null } | null;
}): Promise<CaptureResult> {
  const id = uuidv7();

  // Decode once to learn the real dimensions, then resize only when needed.
  const original = await ImageManipulator.manipulate(input.sourceUri).renderAsync();
  const target = fitWithin(original.width, original.height);
  const rendered = target
    ? await ImageManipulator.manipulate(original).resize(target).renderAsync()
    : original;

  const compressed = await rendered.saveAsync({
    format: SaveFormat.JPEG,
    compress: JPEG_QUALITY,
    base64: NEEDS_BASE64,
  });
  if (rendered !== original) rendered.release();
  original.release();

  const { uri: localUri, sizeBytes } = await persistCompressed(id, compressed);

  const gps = input.gps ?? (await getCurrentPosition().catch(() => null));

  const evidence = await database.write(async () =>
    collections.evidence().create((record) => {
      record._raw.id = id;
      record.kind = 'PHOTO';
      record.context = input.context;
      record.contextId = input.contextId;
      record.contentType = 'image/jpeg';
      record.sizeBytes = sizeBytes;
      record.width = compressed.width;
      record.height = compressed.height;
      record.caption = input.caption ?? null;
      record.localUri = localUri;
      record.capturedAt = Date.now();
      record.latitude = gps?.latitude ?? null;
      record.longitude = gps?.longitude ?? null;
      record.uploadStatus = 'PENDING';
      record.uploadAttempts = 0;
      record.stadiumId = input.stadiumId;
    }),
  );

  return { evidence, localUri };
}

/** Removes a photo the inspector deleted before submitting. */
export async function discardEvidence(evidence: EvidenceModel): Promise<void> {
  const uri = evidence.localUri;
  await database.write(async () => {
    await evidence.destroyPermanently();
  });
  if (uri) deleteLocalFile(uri);
}
