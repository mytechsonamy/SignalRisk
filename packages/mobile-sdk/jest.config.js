module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  moduleNameMapper: {
    '^@react-native-async-storage/async-storage$': '<rootDir>/src/__mocks__/async-storage.ts',
    '^react-native$': '<rootDir>/src/__mocks__/react-native.ts',
  },
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      tsconfig: {
        strict: true,
        esModuleInterop: true,
        skipLibCheck: true,
        baseUrl: '.',
        paths: {
          'react-native': ['src/__mocks__/react-native.ts'],
          '@react-native-async-storage/async-storage': ['src/__mocks__/async-storage.ts'],
        },
      },
    }],
  },
};
