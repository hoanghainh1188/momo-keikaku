import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: {
      '@momo/domain': fileURLToPath(new URL('./packages/domain/src/index.ts', import.meta.url)),
      '@momo/db': fileURLToPath(new URL('./packages/db/src/index.ts', import.meta.url)),
    },
  },
  test: { include: ['packages/**/*.test.ts'], environment: 'node' },
});
