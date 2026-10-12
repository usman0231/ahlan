/**
 * On-device compression target.
 *
 * 1600px on the long edge at JPEG 0.7 keeps a non-compliance legible - you can
 * still read a damaged scaffold tag - while bringing a 4MB phone photo down to
 * roughly 300KB. That difference decides whether an upload completes on stadium
 * mobile data or not.
 */
export const MAX_DIMENSION = 1600;
export const JPEG_QUALITY = 0.7;

/**
 * The size to resize to, or null when the image already fits.
 *
 * Scales by the long edge only and never upscales: a portrait 3000x4000 becomes
 * 1200x1600 (not 1600x2133), and an 800px screenshot is left alone.
 */
export function fitWithin(
  width: number,
  height: number,
  max: number = MAX_DIMENSION,
): { width: number; height: number } | null {
  if (!(width > 0) || !(height > 0)) return null;
  const longEdge = Math.max(width, height);
  if (longEdge <= max) return null;

  const scale = max / longEdge;
  return width >= height
    ? { width: max, height: Math.max(1, Math.round(height * scale)) }
    : { width: Math.max(1, Math.round(width * scale)), height: max };
}
