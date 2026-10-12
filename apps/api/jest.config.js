/** Unit tests: services only, no database and no HTTP. */
/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: 'src',
  testRegex: '.*\.spec\.ts$',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
  collectCoverageFrom: ['**/*.service.ts', '**/*.guard.ts', '**/*.util.ts'],
  coverageDirectory: '../coverage',
};
