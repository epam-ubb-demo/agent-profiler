import { resolve } from 'node:path';

import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [
    {
      // Stub static image imports so tests run without needing actual asset
      // files on disk (mirrors what Vite's asset pipeline does at build time).
      name: 'static-asset-stub',
      resolveId(id) {
        if (/\.(png|jpe?g|gif|svg|webp|ico)$/.test(id)) {
          return '\0static-asset:' + id;
        }
      },
      load(id) {
        if (id.startsWith('\0static-asset:')) {
          return 'export default "";';
        }
      },
    },
  ],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src/renderer'),
    },
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.{test,spec}.{ts,tsx}', '__tests__/**/*.{test,spec}.{ts,tsx}'],
    setupFiles: ['./__tests__/setup.ts'],
    environmentMatchGlobs: [
      ['src/main/**', 'node'],
      ['__tests__/regression/**', 'node'],
    ],
  },
});
