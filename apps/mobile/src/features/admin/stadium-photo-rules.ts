/**
 * Stadium photo limits, mirroring `MAX_STADIUM_IMAGE_BYTES` on the API (8 MB).
 * Kept free of native imports so it can be unit tested.
 */
export const MAX_STADIUM_PHOTO_BYTES = 8 * 1024 * 1024;

export function stadiumPhotoProblem(sizeBytes: number): 'empty' | 'tooLarge' | null {
  if (!(sizeBytes > 0)) return 'empty';
  if (sizeBytes > MAX_STADIUM_PHOTO_BYTES) return 'tooLarge';
  return null;
}
