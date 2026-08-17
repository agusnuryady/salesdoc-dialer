import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
    },
  },
  test: {
    // Default environment stays 'node' — fast, and true for almost every
    // test here (the domain layer has zero DOM dependency). Component tests
    // that need a DOM opt in per-file via a `// @vitest-environment jsdom`
    // docblock instead of paying jsdom's startup cost on the whole suite.
    environment: 'node',
    include: ['src/server/**/*.test.ts', 'src/app/**/*.test.tsx'],
  },
});
