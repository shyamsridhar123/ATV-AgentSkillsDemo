import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      'node:test': 'vitest',
    },
  },
  test: {
    include: ['src/**/*.e2e.test.ts'],
    exclude:
      process.env.INCLUDE_BEADS_E2E === 'true'
        ? []
        : ['src/cli/commands/beads.e2e.test.ts'],
    environment: 'node',
    testTimeout: 30000,
    hookTimeout: 300000,
  },
});
