/**
 * `pnpm seed` — the seed's composition root.
 *
 * `packages/db/src/seed.ts` holds the seeding itself and takes its database handle as an
 * argument, because `packages/db` may not read the environment (see eslint.config.js) and
 * may not import `@momo/app` either — that would invert the architecture's import
 * direction. `scripts/` is deliberately outside the fence, so this is where the two meet:
 * the parsed configuration is read here and the handle is passed in.
 *
 * It connects as the OWNING role (`DATABASE_URL`), not the application role. The reason is
 * in the header of `packages/db/src/seed.ts`: the seed TRUNCATEs, and it writes the
 * `tenant` row, neither of which the restricted role holds a grant for — deliberately.
 *
 * There is no localhost default any more. A missing DATABASE_URL fails here, naming the
 * key, which is the whole point of the removal.
 */
import { closeAllPools, getDb } from '../packages/db/src/client.js';
import { seed } from '../packages/db/src/seed.js';
import { config } from '../packages/app/src/config.js';

try {
  await seed(getDb(config.DATABASE_URL));
} finally {
  await closeAllPools();
}
