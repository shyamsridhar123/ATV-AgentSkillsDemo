import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      'node:test': 'vitest',
    },
  },
  test: {
    include: ['src/**/*.test.ts', 'src/**/*.e2e.test.ts'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      reportsDirectory: 'coverage',
    },
  },
});
