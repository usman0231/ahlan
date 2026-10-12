import type { ImageResult } from 'expo-image-manipulator';

/**
 * Where photos wait for the upload queue - browser build.
 *
 * expo-file-system has no web implementation, so the compressed JPEG is kept as
 * a `data:` URI on the evidence row itself. Unlike a `blob:` URL it survives a
 * page reload (LokiJS persists the row to IndexedDB), and `fetch()` turns it
 * back into the exact bytes for the presigned PUT. The row's copy is dropped
 * once the upload is confirmed, as on a device.
 */

export const NEEDS_BASE64 = true;

export async function persistCompressed(
  _id: string,
  compressed: ImageResult,
): Promise<{ uri: string; sizeBytes: number }> {
  if (!compressed.base64) throw new Error('Image encoder returned no data');
  const uri = `data:image/jpeg;base64,${compressed.base64}`;
  if (compressed.uri.startsWith('blob:')) URL.revokeObjectURL(compressed.uri);
  return { uri, sizeBytes: base64ByteLength(compressed.base64) };
}

/** A Blob is what the browser's fetch sends most efficiently. */
export async function readLocalFile(uri: string): Promise<Blob> {
  const response = await fetch(uri);
  return response.blob();
}

export function localFileExists(uri: string): boolean {
  return uri.startsWith('data:') || uri.startsWith('blob:');
}

export function deleteLocalFile(uri: string): void {
  if (uri.startsWith('blob:')) URL.revokeObjectURL(uri);
  // A data: URI lives on the row; clearing the row's localUri frees it.
}

export function listLocalEvidenceFiles(): { id: string; uri: string }[] {
  return [];
}

export function localEvidenceBytes(uris: string[]): number {
  return uris.reduce((total, uri) => {
    const comma = uri.indexOf(',');
    return uri.startsWith('data:') && comma > 0
      ? total + base64ByteLength(uri.slice(comma + 1))
      : total;
  }, 0);
}

/** Decoded length of a base64 string, without decoding it. */
export function base64ByteLength(base64: string): number {
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  return Math.floor((base64.length * 3) / 4) - padding;
}
