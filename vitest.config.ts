import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: {
      '@momo/domain': fileURLToPath(new URL('./packages/domain/src/index.ts', import.meta.url)),
      '@momo/db': fileURLToPath(new URL('./packages/db/src/index.ts', import.meta.url)),
    },
  },
  // `apps/**` and `scripts/**` joined the list with story 1.1 slice B2. A test the runner
  // never collects is not a gate, and both of that slice's gates live outside `packages/`:
  // apps/worker/src/worker-round-trip.test.ts covers pg-boss on the restricted role, and
  // scripts/pgboss-migrate.test.ts covers the migrator step's pure guards. Nothing under
  // apps/web carries a test file today.
  test: {
    include: ['packages/**/*.test.ts', 'apps/**/*.test.ts', 'scripts/**/*.test.ts'],
    environment: 'node',
  },
});
