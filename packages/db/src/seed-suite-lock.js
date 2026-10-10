/**
 * LIVES IN `packages/db/src` rather than `tests/`, for the same reason `probe-tenants.ts` does:
 * `packages/db/src/rls.test.ts` needs it too, and a `packages/*` file may not import `tests/`
 * (`.dependency-cruiser.cjs`, `no-test-or-tooling-in-source`). `rls.test.ts` writes the
 * `ten-rls-probe` Tenant, so it is a probe suite like any other and must hold the shared half.
 *
 * One advisory lock, serialising the whole-database seed suites against every suite that writes
 * probe Tenants. Epic 1 retrospective, finding F1.
 *
 * WHY THIS EXISTS. `seed()` is a whole-database operation: it TRUNCATEs every registered table
 * CASCADE, rewinds the shared identity sequences to its own `MAX(seq)`, and refuses through
 * `assertSingleTenantDatabase` when it finds more than one Tenant. vitest runs test FILES in
 * parallel worker threads against one Postgres, so those three things ran beside a dozen suites
 * that were busy creating and reading probe Tenants. The symptoms were exactly what that
 * predicts, and they were not reproducible: three consecutive runs against a freshly created
 * database produced three different failure sets — `Refusing to seed: this database holds 3
 * Tenants`, `audit_log_pkey` duplicate keys, and a `40P01` deadlock on the TRUNCATE — while the
 * suite that failed in all three passed when it was the only file running.
 *
 * WHY THE LOCK THAT EXISTED DID NOT DO THIS. `SEED_SUITE_LOCK` was declared separately in
 * `seed-load-orchestration.test.ts` and `seed-fixture-clock.test.ts` and taken in those two files
 * only, so it serialised the seed suites against each other and against nothing else. The ten
 * probe-creating suites never took it.
 *
 * THE PROTOCOL. A suite that creates probe Tenants holds this lock SHARED for its whole lifetime;
 * a suite that seeds the database holds it EXCLUSIVE. Postgres then does the serialising: probe
 * suites run together freely, a seed suite waits until every one of them has finished, and no
 * suite has to know the others exist. `connectWriteHarness` takes the shared half by default, so
 * a new suite under `tests/` is covered by writing no code at all — which is the point, because the failure this
 * prevents is invisible until some unrelated suite happens to interleave badly.
 *
 * WHY A DEDICATED CONNECTION, AND WHY NOT A POOLED ONE. `pg_advisory_lock` is SESSION-scoped. The
 * previous code took it with `owner().execute(...)`, which borrows an arbitrary client from an
 * 8-connection pool and returns it immediately — so the lock lived on whichever session happened
 * to serve that statement, and the matching unlock could easily run on a different one and
 * silently return false.
 *
 * Holding a checked-out POOL client instead is worse, and the first version of this file did
 * exactly that: `pool.end()` waits for every client to be returned, so `closeAllPools()` in a
 * suite's `afterAll` hung forever and nine suites died on hook timeouts. The lock's lifetime is
 * the suite's, not a query's, so it gets a connection of its own that no pool owns. Its socket is
 * `unref`'d, so an unreleased lock can never be what keeps a worker alive.
 */
import pg from 'pg';
/**
 * The advisory key. Carried over unchanged from the two seed suites that used to declare it
 * separately, so a stale process from before this change still interlocks correctly.
 */
export const SEED_SUITE_LOCK = 8_700_000_018;
let held;
/**
 * Takes the lock and holds it until {@link releaseSeedSuiteLock}. Blocks until granted, which is
 * the intended behaviour — a seed suite waiting for the probe suites to finish is the mechanism,
 * not a stall.
 *
 * Acquiring twice in one process would be a self-deadlock the moment the modes conflict (a
 * shared holder waiting for its own exclusive request never resolves, because the two are
 * different sessions and Postgres has no cycle to detect). It throws instead.
 */
export async function acquireSeedSuiteLock(ownerUrl, mode, 
/**
 * Overridable ONLY so `seed-suite-lock.test.ts` can exercise the protocol on a key of its own.
 * That suite runs beside the very suites this lock coordinates, so asserting on the real key
 * would mean asserting about whatever the rest of the run happens to be holding — the same
 * shared-database mistake this module exists to fix. No production caller passes it.
 */
key = SEED_SUITE_LOCK) {
    if (held) {
        throw new Error(`the seed-suite lock is already held as '${held.mode}' in this process; a suite takes it ` +
            `once, at load. Asking for '${mode}' as well would wait on a lock this process is ` +
            'holding itself, and no deadlock detector would ever break it.');
    }
    const client = new pg.Client({ connectionString: ownerUrl });
    await client.connect();
    // Never let the lock connection be the reason a vitest worker stays alive.
    client.connection?.stream?.unref?.();
    try {
        await client.query(mode === 'exclusive'
            ? 'SELECT pg_advisory_lock($1)'
            : 'SELECT pg_advisory_lock_shared($1)', [key]);
    }
    catch (error) {
        await client.end();
        throw error;
    }
    held = { client, mode, key };
}
/**
 * Releases the lock if this process holds it, and closes the connection it was held on. A no-op
 * otherwise, so an `afterAll` may call it unconditionally — including on a suite that skipped
 * because the database was unreachable.
 *
 * Ending the connection alone would drop the lock, because the session goes with it. The explicit
 * unlock is here so that a suite which lets go early releases the waiting seed suite immediately
 * rather than at teardown.
 */
export async function releaseSeedSuiteLock() {
    if (!held)
        return;
    const { client, mode, key } = held;
    held = undefined;
    try {
        await client.query(mode === 'exclusive'
            ? 'SELECT pg_advisory_unlock($1)'
            : 'SELECT pg_advisory_unlock_shared($1)', [key]);
    }
    finally {
        await client.end();
    }
}
