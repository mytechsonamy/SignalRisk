import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  testRegex: '.*\\.(test|spec)\\.ts$',
  moduleFileExtensions: ['ts', 'js', 'json'],
  transform: {
    '^.+\\.ts$': 'ts-jest',
  },

  // Global setup/teardown for DB connections and test containers
  globalSetup: '<rootDir>/setup.ts',
  globalTeardown: '<rootDir>/teardown.ts',

  // Timeouts
  testTimeout: 30_000,

  // Coverage
  collectCoverageFrom: [
    '**/*.ts',
    '!jest.config.ts',
    '!setup.ts',
    '!teardown.ts',
    '!dist/**',
  ],
  coverageDirectory: './coverage',
  coverageThreshold: {
    global: {
      lines: 80,
      branches: 90,
      functions: 80,
      statements: 80,
    },
  },

  // Each test suite gets an isolated schema via db.helper
  // Run with --runInBand for serial execution or --maxWorkers for parallel
  maxWorkers: 1,
};

export default config;
