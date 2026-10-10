import { describe, expect, it } from 'vitest';
import { withTenant } from './with-tenant';
/**
 * `withTenant`'s tenant-id guard, with no database.
 *
 * The guard is the one part of this module whose failure is SILENT. An empty or malformed id
 * is bound into `app.tenant_id` happily; every isolation policy then compares `tenant_id`
 * against a value no row carries, every read comes back empty, and that is
 * indistinguishable from correct isolation — a test suite full of "no rows leaked" passes
 * while the application shows a user nothing at all.
 *
 * Nothing here touches Postgres, and that is the point: the guard has to reject before
 * `db.transaction` is reached. The handle below is a sentinel that THROWS if it is ever
 * touched, so a guard that let a bad id through would fail loudly instead of trying to
 * connect.
 */
/** A `Db` that refuses to be used. Reaching it at all means the guard did not fire. */
const unusableDb = new Proxy({}, {
    get(_target, property) {
        throw new Error(`withTenant reached the database (property ${String(property)}) instead of refusing the tenant id`);
    },
});
const rejected = [
    ['the empty string', ''],
    ['whitespace', '   '],
    ['a tab', '\t'],
    ['a leading hyphen', '-ten-momo'],
    ['a leading underscore', '_ten'],
    ['an embedded space', 'ten momo'],
    ['a quote', "ten'momo"],
    ['a semicolon', 'ten;drop'],
    ['a comma', 'ten,momo'],
    ['a percent sign', 'ten%momo'],
    ['a newline', 'ten\nmomo'],
    ['65 characters', 'a'.repeat(65)],
];
describe('withTenant refuses a tenant id it cannot trust', () => {
    for (const [label, value] of rejected) {
        it(`rejects ${label} before opening a transaction`, async () => {
            await expect(withTenant(unusableDb, value, async () => 'should not run')).rejects.toThrow(/not a usable tenant id/);
        });
    }
    it('names the offending value, so the failure is diagnosable', async () => {
        await expect(withTenant(unusableDb, '', async () => null)).rejects.toThrow('""');
    });
    it('accepts the shapes real tenant ids take', async () => {
        // Reaching the database is the pass condition here: the sentinel throws its own distinct
        // message, which proves the guard let the id through rather than that it accepted it by
        // doing nothing. Both the current `ten-momo` form and the UUIDv7 a later story moves to.
        for (const accepted of ['ten-momo', 'ten_momo', 'T1', '0189d0a2-7c1f-7e3a-8a1b-2f3c4d5e6f70']) {
            await expect(withTenant(unusableDb, accepted, async () => null)).rejects.toThrow(/withTenant reached the database/);
        }
    });
});
