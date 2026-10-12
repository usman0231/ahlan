/**
 * Jest setup for the app.
 *
 * Native modules are mocked rather than stubbed in each test: these are the
 * boundaries the component and hook tests are not about - the camera, the GPS,
 * the keychain, the SQLite adapter - and mocking them once here keeps the tests
 * themselves readable.
 */
// RNTL 13 registers its jest matchers automatically; `extend-expect` is gone.

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => undefined),
  deleteItemAsync: jest.fn(async () => undefined),
}));

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(async () => undefined),
  notificationAsync: jest.fn(async () => undefined),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
}));

jest.mock('expo-location', () => ({
  requestForegroundPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
  getCurrentPositionAsync: jest.fn(async () => ({
    coords: { latitude: 25.3, longitude: 51.5, accuracy: 8 },
  })),
  Accuracy: { Balanced: 3 },
  PermissionStatus: { GRANTED: 'granted' },
}));

jest.mock('expo-system-ui', () => ({
  setBackgroundColorAsync: jest.fn(async () => undefined),
}));

jest.mock('expo-localization', () => ({
  getLocales: () => [{ languageCode: 'en' }],
}));

jest.mock('@react-native-community/netinfo', () => ({
  addEventListener: jest.fn(() => () => undefined),
  fetch: jest.fn(async () => ({ isConnected: true, isInternetReachable: true, type: 'wifi' })),
}));

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

// The SQLite adapter needs the native JSI bridge, which does not exist in Jest.
jest.mock('./src/db', () => ({
  database: { write: jest.fn(), get: jest.fn() },
  collections: {},
  resetDatabase: jest.fn(),
}));

jest.mock('expo-constants', () => ({
  default: { expoConfig: { version: '0.1.0' } },
  expoConfig: { version: '0.1.0' },
}));
