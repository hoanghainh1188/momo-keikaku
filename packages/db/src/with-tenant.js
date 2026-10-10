import { stringify } from '@momo/domain';
import { sql } from 'drizzle-orm';
import { TENANT_SETTING } from './table-classes';
/**
 * Tenant ids are opaque strings today (`ten-momo`); the architecture moves them to
 * app-generated UUIDv7 in a later story, and `set_config` takes text either way. This
 * check is not an injection defence — the value is *bound*, see below — it is a guard
 * against the empty string, which would set the setting to `''`, match no row, and look
 * exactly like correct isolation while actually being a bug.
 */
const TENANT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
/**
 * Runs `fn` inside a transaction with `app.tenant_id` set to `tenantId`.
 *
 * This is the ONLY sanctioned path to tenant-owned data. Every isolation policy compares
 * `tenant_id` to `current_setting('app.tenant_id', true)`, and `current_setting` with
 * `missing_ok = true` returns NULL when nothing set it — so a read that skips this
 * function returns no rows rather than raising, which is what the sabotage test pins.
 *
 * Two things about the statement below are load-bearing:
 *
 *   1. `set_config(..., is_local => true)` scopes the value to the transaction. It is
 *      reset at COMMIT or ROLLBACK, so a pooled connection cannot hand the next borrower a
 *      tenant it never asked for — the failure mode that makes pooling and session-scoped
 *      settings a bad pair.
 *   2. The tenant id is a BOUND PARAMETER. The non-parameterizable `SET LOCAL` form of the
 *      same setting cannot take one: its right-hand side is not an expression, so the value
 *      would have to be interpolated into the statement text. That form is banned outright
 *      — by an ESLint rule and by `source-discipline.test.ts` — because "interpolate the
 *      tenant id into SQL" is the exact shape of the bug this whole story exists to
 *      prevent. The phrase itself appears nowhere in this repository, so a plain `grep -r`
 *      for it returns nothing at all.
 *
 * @param db the bare handle, from `getDb(connectionString)`.
 * @param tenantId the Tenant whose rows `fn` may see.
 * @param fn the work. Everything inside it must be issued on the `tx` it is given; the
 *   bare `db` handle is still connected to the same pool but *outside* this transaction,
 *   so a query on it would see no tenant at all.
 */
export async function withTenant(db, tenantId, fn) {
    if (!TENANT_ID_PATTERN.test(tenantId)) {
        throw new Error(`withTenant was given ${typeof tenantId === 'string' ? stringify(tenantId) : String(tenantId)}, which is not a usable tenant id. ` +
            'An empty or malformed id would set the isolation setting to a value no row carries, ' +
            'which reads exactly like correct isolation and is not.');
    }
    return db.transaction(async (tx) => {
        await tx.execute(sql `SELECT set_config(${TENANT_SETTING}, ${tenantId}, true)`);
        return fn(tx);
    });
}
/**
 * Reads back what `withTenant` set.
 *
 * Returns `null` outside a `withTenant` block — including for the empty string, which
 * `NULLIF` folds into NULL exactly as the isolation policy does. That is the state that makes
 * every tenant-owned table read as empty, and `rls.test.ts` asserts both ends of it.
 */
export async function currentTenant(tx) {
    const result = await tx.execute(sql `SELECT nullif(current_setting(${TENANT_SETTING}, true), '') AS tenant`);
    return result.rows[0]?.tenant ?? null;
}
