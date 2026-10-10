import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema';
/**
 * The connection is a value, not an ambient fact.
 *
 * This module used to export `DATABASE_URL`, read from `process.env` with a hardcoded
 * `postgres://momo:momo@localhost:55433/momo_keikaku` fallback — the one sanctioned
 * exception to the environment fence, and a KNOWN CONTRADICTION with the fail-boot promise
 * in `packages/app/src/config.ts`: on a machine where that database exists, a missing
 * DATABASE_URL connected *successfully, to the wrong place*. The founder decided on
 * 2026-09-20 to remove it in this story, because this story introduces
 * `getDb(connectionString)` and therefore touches exactly that line. `drizzle.config.ts`
 * carried the identical default and moved with it.
 *
 * `packages/db` still does not read the environment: it cannot import `@momo/app` (that
 * inverts the architecture's import direction — `packages/db` implements ports that
 * `packages/app` declares), and it must not read `process.env` itself. So the connection
 * string arrives as an argument, from each composition root:
 *
 *   * `apps/web/src/server/composition.ts` — `config.APP_DATABASE_URL`
 *   * `apps/worker/src/index.ts`    — `config.APP_DATABASE_URL` (through pg-boss)
 *   * `packages/db/src/seed.ts`     — `DATABASE_URL`, the owner, because it TRUNCATEs
 *   * the tests and `scripts/`      — whichever role the assertion is about
 *
 * Pools are memoised per connection string rather than in a single module-level slot, so
 * a process that legitimately holds two roles at once — the tests hold the owner and the
 * application role together — does not silently get one pool pointed at the other's role.
 */
/** Pools by connection string. The key is the identity: a different role is a different pool. */
const pools = new Map();
/**
 * Fails naming the configuration key rather than connecting to a default.
 *
 * `undefined` reaches here when a caller passes `config.SOMETHING` from a config object
 * that was never parsed, or an optional value that was never set. The message names both
 * keys because which one is missing depends on which role the caller wanted, and the
 * caller is the only one who knows.
 */
function assertConnectionString(connectionString) {
    if (typeof connectionString !== 'string' || connectionString.trim() === '') {
        throw new Error('A PostgreSQL connection string is required and none was given. There is no localhost ' +
            'default: set DATABASE_URL (the owning role) or APP_DATABASE_URL (the restricted ' +
            'application role) and pass it in, so a missing key fails here rather than connecting ' +
            'successfully to the wrong database.');
    }
}
/**
 * The pool for one connection string, created on first use.
 *
 * @param connectionString the role to connect as. See the module note: this is
 *   `config.APP_DATABASE_URL` for everything the application does, and `DATABASE_URL`
 *   only where ownership is genuinely required.
 */
export function getPool(connectionString) {
    assertConnectionString(connectionString);
    let pool = pools.get(connectionString);
    if (!pool) {
        pool = new pg.Pool({ connectionString, max: 8 });
        pools.set(connectionString, pool);
    }
    return pool;
}
const dbs = new Map();
/**
 * The Drizzle handle for one connection string.
 *
 * NOTE: the handle this returns is the *bare* handle. It may open transactions, and it may
 * not issue queries against tenant-owned tables — `withTenant` is the only sanctioned path,
 * because it is the only one that sets `app.tenant_id`. A lint rule and
 * `packages/db/src/source-discipline.test.ts` enforce that as a naming convention: a
 * variable called `db` may not call `select`, `insert`, `update`, `delete` or `execute`,
 * and the handle `withTenant` hands its callback — called `tx` — is what does.
 */
export function getDb(connectionString) {
    assertConnectionString(connectionString);
    let db = dbs.get(connectionString);
    if (!db) {
        db = drizzle(getPool(connectionString), { schema });
        dbs.set(connectionString, db);
    }
    return db;
}
/**
 * Closes every pool this module opened.
 *
 * For tests and scripts, which hold more than one role and would otherwise leave the
 * process hanging on open handles. Idempotent.
 */
export async function closeAllPools() {
    const open = [...pools.values()];
    pools.clear();
    dbs.clear();
    await Promise.all(open.map((pool) => pool.end()));
}
export { schema };
