import { Directory, File, Paths } from 'expo-file-system';
import type { ImageResult } from 'expo-image-manipulator';

/**
 * Where photos wait on the device for the upload queue - native build.
 *
 * `local-files.web.ts` is the browser twin: expo-file-system's classes are
 * stubs on web, so anything here would throw there.
 */

/** Whether `saveAsync` must also return base64 (only the web build keeps it). */
export const NEEDS_BASE64 = false;

/** The documents directory, not the cache: a queued photo must survive the OS reclaiming cache space. */
function evidenceDirectory(): Directory {
  const directory = new Directory(Paths.document, 'evidence');
  if (!directory.exists) directory.create({ intermediates: true });
  return directory;
}

/** Moves the compressed image into the app's own directory and measures it. */
export async function persistCompressed(
  id: string,
  compressed: ImageResult,
): Promise<{ uri: string; sizeBytes: number }> {
  const target = new File(evidenceDirectory(), `${id}.jpg`);
  if (target.exists) target.delete();
  new File(compressed.uri).move(target);

  // `size` can come back null on some file providers; the bytes never lie.
  const size = target.size;
  const sizeBytes = typeof size === 'number' && size > 0 ? size : (await target.bytes()).byteLength;
  return { uri: target.uri, sizeBytes };
}

/** The exact bytes that will be PUT; their length is what gets signed. */
export async function readLocalFile(uri: string): Promise<Uint8Array> {
  return new File(uri).bytes();
}

export function localFileExists(uri: string): boolean {
  try {
    return new File(uri).exists;
  } catch {
    return false;
  }
}

/** Deleting is synchronous and throws when the file is already gone. */
export function deleteLocalFile(uri: string): void {
  try {
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch {
    // Already removed, or never written: nothing to clean up.
  }
}

/** Every stored photo as `{ id, uri }`, for sweeping orphans. */
export function listLocalEvidenceFiles(): { id: string; uri: string }[] {
  try {
    return evidenceDirectory()
      .list()
      .filter((entry): entry is File => entry instanceof File)
      .map((file) => ({ id: file.name.replace(/\.[^.]+$/, ''), uri: file.uri }));
  } catch {
    return [];
  }
}

/** Total size of the photos still on this device, for the Settings screen. */
export function localEvidenceBytes(uris: string[]): number {
  let total = 0;
  for (const uri of uris) {
    try {
      const info = new File(uri).info();
      if (typeof info.size === 'number') total += info.size;
    } catch {
      // Unreadable file: not counted.
    }
  }
  return total;
}
