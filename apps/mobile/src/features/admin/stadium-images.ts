/* eslint-disable @typescript-eslint/no-require-imports -- Metro bundles static assets through require(). */
import type { ImageSourcePropType } from 'react-native';

/**
 * Bundled venue photos, keyed by stadium code.
 *
 * Bundled rather than uploaded: there are eight venues for the whole
 * tournament, the photos never change, and the stadium list must look right
 * on a cold start with no network. Compressed to 1200px / JPEG q75.
 * A code with no photo returns null and the card draws the branded
 * graphite placeholder instead.
 */
const IMAGES: Record<string, ImageSourcePropType> = {
  KAS: require('../../../assets/stadiums/KAS.jpg'),
  PAF: require('../../../assets/stadiums/PAF.jpg'),
  ARM: require('../../../assets/stadiums/ARM.jpg'),
  KFS: require('../../../assets/stadiums/KFS.jpg'),
  KSU: require('../../../assets/stadiums/KSU.jpg'),
  KDA: require('../../../assets/stadiums/KDA.jpg'),
  IMU: require('../../../assets/stadiums/IMU.jpg'),
  SHB: require('../../../assets/stadiums/SHB.jpg'),
};

export function stadiumImage(code: string | null | undefined): ImageSourcePropType | null {
  if (!code) return null;
  return IMAGES[code.trim().toUpperCase()] ?? null;
}
