import { configDefaults, defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

/**
 * Wall-clock NFR suites (`*-nfr*.test.ts`): each asserts elapsed time against a budget — NFR-P1's
 * p95 ≤ 300 ms under the fence lock, the 5-minute ingest and ledger budgets. Inside `pnpm test`
 * they shared the machine with 150+ files running in parallel and measured that contention, not
 * the code: fence-nfr-p1 read p95 455–555 ms on runs where it passes alone. They run instead
 * under `pnpm test:nfr` (`vitest.nfr.config.ts`), one file at a time, as their own CI step.
 */
export const NFR_TESTS = ['**/*-nfr*.test.ts'];

export default defineConfig({
  resolve: {
    alias: {
      // apps/web's own `@/…` specifier (story 1.4 slice 1: the middleware and sign-in action tests).
      '@/': fileURLToPath(new URL('./apps/web/src/', import.meta.url)),
      // Before the bare name: an alias matches its key as a PREFIX too, so without this entry
      // `@momo/domain/present` would resolve to `.../src/index.ts/present`. With
      // `present/approximate` (story 5.14), these are the only domain subpaths `apps/web` imports
      // (`.dependency-cruiser.cjs`, web-to-domain-present-only); that one goes first, for the
      // same prefix reason.
      '@momo/domain/present/approximate': fileURLToPath(
        new URL('./packages/domain/src/present/approximate.ts', import.meta.url),
      ),
      '@momo/domain/present': fileURLToPath(
        new URL('./packages/domain/src/present/index.ts', import.meta.url),
      ),
      '@momo/domain': fileURLToPath(new URL('./packages/domain/src/index.ts', import.meta.url)),
      // Before `@momo/db`, for the prefix reason above: `@momo/db-auth` starts with `@momo/db`.
      '@momo/db-auth': fileURLToPath(new URL('./packages/db/auth/src/index.ts', import.meta.url)),
      '@momo/db': fileURLToPath(new URL('./packages/db/src/index.ts', import.meta.url)),
      '@momo/app': fileURLToPath(new URL('./packages/app/src/index.ts', import.meta.url)),
      '@momo/adapters': fileURLToPath(new URL('./packages/adapters/src/index.ts', import.meta.url)),
      '@momo/i18n': fileURLToPath(new URL('./packages/i18n/src/index.ts', import.meta.url)),
    },
  },
  // `apps/**` and `scripts/**` joined the list with story 1.1 slice B2. A test the runner
  // never collects is not a gate, and both of that slice's gates live outside `packages/`:
  // apps/worker/src/worker-round-trip.test.ts covers pg-boss on the restricted role, and
  // scripts/pgboss-migrate.test.ts covers the migrator step's pure guards. apps/web carried no
  // test file then; story 1.4 gave it six (the session gate, the result and form helpers, and the
  // sign-in, forgot-password and reset-password actions), which is what the `@/` alias above is
  // for.
  //
  // `tests/**` joined with story 1.2 slice 3. The cross-tenant harness moved there from
  // `packages/db`, because it now wires `packages/app`'s use cases to `packages/db`'s
  // repository — a composition root of its own, and a suite spanning layers belongs to none
  // of them. Drop this entry and NFR-S1's harness silently stops running.
  test: {
    include: [
      'packages/**/*.test.ts',
      'apps/**/*.test.ts',
      'scripts/**/*.test.ts',
      'tests/**/*.test.ts',
    ],
    exclude: [...configDefaults.exclude, ...NFR_TESTS],
    environment: 'node',
    // AD-17: vitest is one of the three local suppliers of DEPLOYMENT=local (alongside
    // apps/web/.env.development and the worker's start:dev). Never set this in ci.yml's job env.
    env: {
      DEPLOYMENT: 'local',
      // Story 5.2 / AR-29: local AES key for unit tests that touch credentials crypto.
      CREDENTIALS_CRYPTO: 'local',
      CREDENTIALS_KEY: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
      CREDENTIALS_KEY_ID: 'vitest-local',
    },
  },
});
