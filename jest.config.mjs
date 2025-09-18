import nextJest from 'next/jest.js'

const createJestConfig = nextJest({
  // Provide the path to your Next.js app to load next.config.js and .env files in your test environment
  dir: './',
})

// Add any custom config to be passed to Jest
/** @type {import('jest').Config} */
const config = {
  // Add more setup options before each test is run
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js', '<rootDir>/bsv-torrent/__tests__/setup/bsv-setup.ts'],
  // Use Node environment for wallet-toolbox compatibility
  testEnvironment: 'node',
  preset: 'ts-jest/presets/default-esm',
  // Extended timeout for blockchain operations
  testTimeout: 30000,
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
    '^webtorrent$': '<rootDir>/bsv-torrent/__tests__/__mocks__/webtorrent.ts',
  },
  collectCoverageFrom: [
    'app/**/*.{js,jsx,ts,tsx}',
    'bsv-torrent/**/*.{js,jsx,ts,tsx}',
    'lib/**/*.{js,jsx,ts,tsx}',
    '!**/*.d.ts',
    '!**/node_modules/**',
    '!**/.next/**',
    '!**/__tests__/**',
  ],
  coverageThreshold: {
    global: {
      branches: 85,
      functions: 85,
      lines: 85,
      statements: 85
    }
  },
  testPathIgnorePatterns: ['<rootDir>/.next/', '<rootDir>/node_modules/'],
  moduleDirectories: ['node_modules', '<rootDir>/'],
  // Global setup and teardown for BSV operations
  globalSetup: '<rootDir>/bsv-torrent/__tests__/setup/global-setup.ts',
  globalTeardown: '<rootDir>/bsv-torrent/__tests__/setup/global-teardown.ts',
}

// createJestConfig is exported this way to ensure that next/jest can load the Next.js config which is async
export default createJestConfig(config)