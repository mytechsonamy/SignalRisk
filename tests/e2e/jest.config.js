module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/mocks/**/*.spec.ts', '**/utils/**/*.spec.ts'],
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        tsconfig: {
          target: 'ES2020',
          module: 'commonjs',
          strict: true,
          esModuleInterop: true,
        },
      },
    ],
  },
};
