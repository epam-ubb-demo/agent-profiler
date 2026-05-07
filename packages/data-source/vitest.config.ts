import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
    include: ['__tests__/**/*.test.ts', '__tests__/**/*.test.tsx'],
    environmentMatchGlobs: [
      ['__tests__/**/*.test.tsx', 'jsdom'],
    ],
  },
});
