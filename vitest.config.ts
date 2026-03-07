import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    include: ['src/__tests__/**/*.test.ts', 'src/__tests__/**/*.e2e.test.ts'],
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
