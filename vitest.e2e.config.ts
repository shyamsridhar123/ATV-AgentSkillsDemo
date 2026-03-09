import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      'node:test': 'vitest',
    },
  },
  test: {
    include: ['src/**/*.e2e.test.ts'],
    exclude: ['**/beads.e2e.test.ts'],
    environment: 'node',
    testTimeout: 30000,
    hookTimeout: 300000,
  },
});
