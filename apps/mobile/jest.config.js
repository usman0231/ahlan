/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  /**
   * Reanimated's worklets runtime ships this resolver so that it resolves its
   * non-native implementation under Jest. Without it, importing anything
   * animated tries to reach the JSI runtime and throws.
   */
  resolver: 'react-native-worklets/jest/resolver',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@sentry/react-native|native-base|react-native-svg|nativewind|react-native-css-interop|@nozbe/watermelondb|@shopify/flash-list|@gorhom/bottom-sheet|react-native-worklets|lucide-react-native)',
  ],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@app/(.*)$': '<rootDir>/app/$1',
  },
  testMatch: ['**/__tests__/**/*.test.{ts,tsx}', '**/*.test.{ts,tsx}'],
  collectCoverageFrom: ['src/**/*.{ts,tsx}', '!src/**/*.d.ts'],
};
