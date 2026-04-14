import path from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['**/*.test.ts'],
    exclude: [
      '**/node_modules/**',
      '**/.claude/**',
      '**/.tmp-build-repro/**',
      '**/.open-next/**',
      '**/.next/**',
    ],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
      '@workers': path.resolve(__dirname, 'workers'),
      '@services': path.resolve(__dirname, 'services'),
    },
  },
});
