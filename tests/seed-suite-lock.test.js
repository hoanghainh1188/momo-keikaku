/**
 * The lock protocol that keeps the whole-database seed suites from colliding with every suite
 * that creates probe Tenants.
 *
 * Epic 1 retrospective, finding F1. `seed()` TRUNCATEs every registered table, rewinds the shared
 * identity sequences to its own MAX, and refuses through `assertSingleTenantDatabase` when the
 * database holds more than one Tenant. None of that is safe while another suite is using the same
 * database — and vitest runs test FILES in parallel worker threads, so `tests/` had roughly a
 * dozen suites sharing one Postgres. The lock that existed covered only the two seed suites
 * against each other (`SEED_SUITE_LOCK`, declared twice, taken in neither of the ten
 * probe-creating suites), which is why a pristine-database run failed non-deterministically:
 * three consecutive clean runs produced three different failure sets, and the file that failed in
 * all three passed when run alone.
 *
 * The protocol: every probe-creating suite holds the lock SHARED for its lifetime, and a seed
 * suite takes it EXCLUSIVE. Postgres then does the serialising — many probe suites run together,
 * a seed suite waits for all of them, and nothing has to remember to clean up first.
 *
 * These assertions use `pg_try_advisory_lock*`, which returns false instead of waiting, so the
 * suite proves the blocking relation without depending on any timing.
 *
 * AND THEY USE A KEY OF THEIR OWN. This file runs beside the suites the real key coordinates, so
 * asserting on `SEED_SUITE_LOCK` itself would be asserting about whatever the rest of the run
 * happens to be holding at that instant — the same shared-database mistake the module fixes. The
 * first draft of this suite did exactly that and failed for exactly that reason.
 */
import { afterAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { closeAllPools, getPool } from '../packages/db/src/client';
import { SEED_SUITE_LOCK, acquireSeedSuiteLock, releaseSeedSuiteLock } from '../packages/db/src/seed-suite-lock';
/**
 * This suite's own advisory key, deliberately NOT `SEED_SUITE_LOCK`, and outside the probe
 * `seq` bands so it collides with nothing. Pinned against the real key below, so the two can
 * never drift into being the same number.
 */
const TEST_KEY = 8_700_000_019;
const OWNER_URL = process.env.DATABASE_URL;
const REQUIRE_DB = process.env.REQUIRE_DB === '1';
async function reachable() {
    if (!OWNER_URL)
        return false;
    try {
        const client = await getPool(OWNER_URL).connect();
        client.release();
        return true;
    }
    catch {
        return false;
    }
}
const isReachable = await reachable();
if (REQUIRE_DB && !isReachable) {
    throw new Error('REQUIRE_DB=1 but DATABASE_URL is not reachable as the owning role.');
}
/**
 * Independent sessions, not pooled clients: each assertion below is about what ONE session can
 * take while ANOTHER holds something, which a shared pool would blur.
 */
const sessions = [];
async function session() {
    const client = new pg.Client({ connectionString: OWNER_URL });
    await client.connect();
    sessions.push(client);
    return client;
}
async function tryShared(client) {
    const r = await client.query('SELECT pg_try_advisory_lock_shared($1) AS ok', [
        TEST_KEY,
    ]);
    return r.rows[0].ok;
}
async function tryExclusive(client) {
    const r = await client.query('SELECT pg_try_advisory_lock($1) AS ok', [
        TEST_KEY,
    ]);
    return r.rows[0].ok;
}
/** How many sessions hold TEST_KEY right now, whatever the mode. */
async function holderCount(client) {
    const r = await client.query(`SELECT count(*)::text AS n FROM pg_locks
      WHERE locktype = 'advisory' AND granted
        AND ((classid::bigint << 32) | objid::bigint) = $1`, [TEST_KEY]);
    return Number(r.rows[0].n);
}
it('uses a key of its own, so it never contends with the suites under coordination', () => {
    expect(TEST_KEY).not.toBe(SEED_SUITE_LOCK);
});
afterAll(async () => {
    await releaseSeedSuiteLock();
    await Promise.all(sessions.map((c) => c.end()));
    await closeAllPools();
});
describe.skipIf(!isReachable)('the seed-suite lock protocol (retro F1)', () => {
    it('lets two probe suites hold it at once, and refuses a seed suite while they do', async () => {
        const probeA = await session();
        const probeB = await session();
        const seedSuite = await session();
        expect(await tryShared(probeA), 'first probe suite takes it shared').toBe(true);
        expect(await tryShared(probeB), 'a second probe suite takes it shared too').toBe(true);
        expect(await tryExclusive(seedSuite), 'a seed suite must NOT get the lock while probe suites hold it — this is the assertion ' +
            'that would have caught F1').toBe(false);
        await probeA.query('SELECT pg_advisory_unlock_shared($1)', [TEST_KEY]);
        expect(await tryExclusive(seedSuite), 'still refused while the second probe suite holds it').toBe(false);
        await probeB.query('SELECT pg_advisory_unlock_shared($1)', [TEST_KEY]);
        expect(await tryExclusive(seedSuite), 'granted once the last probe suite lets go').toBe(true);
        await seedSuite.query('SELECT pg_advisory_unlock($1)', [TEST_KEY]);
    });
    it('refuses a probe suite while a seed suite holds it exclusively', async () => {
        const seedSuite = await session();
        const probe = await session();
        expect(await tryExclusive(seedSuite)).toBe(true);
        expect(await tryShared(probe), 'a probe suite must wait for the TRUNCATE rather than write beside it').toBe(false);
        await seedSuite.query('SELECT pg_advisory_unlock($1)', [TEST_KEY]);
        expect(await tryShared(probe)).toBe(true);
        await probe.query('SELECT pg_advisory_unlock_shared($1)', [TEST_KEY]);
    });
    it('acquires and releases through the harness helpers, on a session of its own', async () => {
        const observer = await session();
        expect(await holderCount(observer), 'nothing held before').toBe(0);
        await acquireSeedSuiteLock(OWNER_URL, 'shared', TEST_KEY);
        expect(await holderCount(observer), 'held after acquire').toBe(1);
        await releaseSeedSuiteLock();
        expect(await holderCount(observer), 'released after release').toBe(0);
        // Releasing twice is a no-op, so an afterAll may always call it.
        await releaseSeedSuiteLock();
        expect(await holderCount(observer)).toBe(0);
    });
});
