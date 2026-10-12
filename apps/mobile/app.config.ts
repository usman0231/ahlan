import type { ExpoConfig } from 'expo/config';

/**
 * Expo Go is not supported: WatermelonDB, Skia and the camera are native
 * modules, so this app only ever runs in a dev build or a release build.
 *
 *   pnpm --filter mobile android   # builds and installs the dev client
 *   pnpm --filter mobile start     # Metro, for an existing dev build
 */
const config: ExpoConfig = {
  name: 'Ahlan HSE',
  slug: 'ahlan-hse',
  version: '0.1.0',
  scheme: 'ahlanhse',
  orientation: 'portrait',
  userInterfaceStyle: 'automatic',
  // Rendered from assets/brand/mark.svg - one drawing for icon, splash and
  // the in-app LogoMark component.
  icon: './assets/brand/icon.png',
  // Arabic is a first-class locale, not an afterthought.
  extra: { supportedLocales: ['en', 'ar'] },

  ios: {
    bundleIdentifier: 'local.ahlan.hse',
    supportsTablet: true,
    infoPlist: {
      NSCameraUsageDescription:
        'Ahlan HSE uses the camera to attach photo evidence to inspections and observations.',
      NSPhotoLibraryUsageDescription:
        'Ahlan HSE can attach existing photos as evidence for an inspection finding.',
      NSLocationWhenInUseUsageDescription:
        'Ahlan HSE records the location of each inspection and observation for traceability.',
      // Arabic needs right-to-left layout on iOS.
      UISupportedInterfaceOrientations: ['UIInterfaceOrientationPortrait'],
    },
  },

  android: {
    package: 'local.ahlan.hse',
    adaptiveIcon: {
      foregroundImage: './assets/brand/adaptive-icon.png',
      backgroundColor: '#0B0C0E',
    },
    permissions: [
      'CAMERA',
      'ACCESS_FINE_LOCATION',
      'ACCESS_COARSE_LOCATION',
      'VIBRATE',
      'POST_NOTIFICATIONS',
    ],
  },

  /**
   * Web is a UI-review target only, not a shipping platform.
   *
   * The camera, SQLite JSI, haptics and SecureStore have no browser
   * equivalent, so the `.web.tsx` / `.web.ts` siblings next to those modules
   * stand in for them. It renders the real screens, components, design tokens,
   * themes and translations, which is what makes it useful for reviewing the
   * UI without an Android SDK on the machine.
   */
  web: {
    bundler: 'metro',
    output: 'single',
    favicon: './assets/brand/favicon.png',
    name: 'Ahlan HSE',
    themeColor: '#0B1736',
  },

  plugins: [
    'expo-router',
    'expo-secure-store',
    [
      'expo-splash-screen',
      {
        image: './assets/brand/splash-icon.png',
        imageWidth: 220,
        backgroundColor: '#0B0C0E',
        dark: { image: './assets/brand/splash-icon.png', backgroundColor: '#0B0C0E' },
        resizeMode: 'contain',
      },
    ],
    [
      'expo-build-properties',
      {
        android: {
          // WatermelonDB's JSI adapter needs these.
          minSdkVersion: 24,
          // Development only: the local API is plain HTTP on a LAN address.
          // Remove this for a release build pointing at HTTPS.
          usesCleartextTraffic: true,
          compileSdkVersion: 35,
          targetSdkVersion: 35,
          packagingOptions: { pickFirst: ['**/libc++_shared.so'] },
        },
        ios: { deploymentTarget: '16.4' },
      },
    ],
    [
      'expo-camera',
      {
        cameraPermission:
          'Ahlan HSE uses the camera to attach photo evidence to inspections and observations.',
      },
    ],
    [
      'expo-location',
      {
        locationWhenInUsePermission:
          'Ahlan HSE records the location of each inspection and observation for traceability.',
      },
    ],
    ['expo-notifications', { color: '#2447D6' }],
  ],

  experiments: { typedRoutes: true },
};

export default config;
