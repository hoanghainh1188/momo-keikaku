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
 * Story 1.4 slice 1: it also reads `SEED_DEMO_PASSWORD` (required — CI sets it) and hashes it
 * through `@momo/db-auth`, Better Auth's own scrypt, so the demo users `linh` and `hoang` can
 * sign in with it. `packages/db` is handed the hash, never the password.
 *
 * Story 1.8: reads `DEPLOYMENT` / `CLOCK_MODE` (AD-17 refusals apply), injects the product
 * Clock into the seed, and selects `SEED_PROFILE=demo|load`.
 *
 * There is no localhost default any more. A missing DATABASE_URL fails here, naming the
 * key, which is the whole point of the removal.
 */
import { fixtureClockOn, systemClock } from '../packages/adapters/src/index.js';
import { closeAllPools, getDb } from '../packages/db/src/client.js';
import { latestFixtureObservedAt } from '../packages/db/src/fixtures.js';
import { seed } from '../packages/db/src/seed.js';
import { hashPassword } from '../packages/db/auth/src/password.js';
import { config } from '../packages/app/src/config.js';
function productClock() {
    // Reading CLOCK_MODE applies the AD-17 refusal when DEPLOYMENT is not local.
    switch (config.CLOCK_MODE) {
        case 'system':
            return systemClock;
        case 'fixture': {
            const anchor = config.FIXTURE_TIME_ANCHOR;
            return fixtureClockOn({
                latestObservedAt: latestFixtureObservedAt(anchor),
                anchor,
            });
        }
    }
}
try {
    const demoPasswordHash = await hashPassword(config.SEED_DEMO_PASSWORD);
    await seed(getDb(config.DATABASE_URL), {
        demoPasswordHash,
        clock: productClock(),
        profile: config.SEED_PROFILE,
    });
}
finally {
    await closeAllPools();
}
