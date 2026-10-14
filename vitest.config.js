import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.js'],
    globalSetup: ['tests/global-setup.js'],
    setupFiles: ['tests/setup.js'],
    // API tests share one database
    fileParallelism: false,
    testTimeout: 15000,
  },
})
