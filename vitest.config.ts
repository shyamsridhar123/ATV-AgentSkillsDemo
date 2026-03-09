import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      'node:test': 'vitest',
    },
  },
  test: {
    include: ['src/**/*.test.ts', 'src/**/*.e2e.test.ts'],
    exclude: ['src/cli/commands/beads.e2e.test.ts', 'node_modules/**'],
    environment: 'node',
    testTimeout: 30000,
    coverage: {
      provider: 'v8',
      reportsDirectory: 'coverage',
    },
  },
});
