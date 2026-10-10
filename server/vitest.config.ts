import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    setupFiles: ['./tests/setup.ts'],
    testTimeout: 60000,
    hookTimeout: 600000,
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
  },
});
