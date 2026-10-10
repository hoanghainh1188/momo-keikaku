import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createThrowawayDatabase, reachable } from '../throwaway-database';
import { databaseHoldsATenant } from './tenant';
/**
 * Decision Q2-A: `pnpm dev` seeds only when the owning role finds no `tenant` row.
 *
 * Runs in a throwaway database of its own (a bare `tenant` table is all the probe reads), never
 * in the shared `momo_keikaku` one. Skipped without a database, unless REQUIRE_DB=1.
 */
const REQUIRE_DB = process.env.REQUIRE_DB === '1';
const OWNER_DATABASE_URL = process.env.DATABASE_URL;
if (REQUIRE_DB && !OWNER_DATABASE_URL) {
    throw new Error('REQUIRE_DB=1 but DATABASE_URL is not set: the Q2-A seed-skip rule must not be skipped.');
}
const dbReachable = await reachable(OWNER_DATABASE_URL);
if (REQUIRE_DB && !dbReachable) {
    throw new Error('REQUIRE_DB=1 but the database is not reachable. Run `pnpm db:up` first.');
}
describe.skipIf(!dbReachable)('databaseHoldsATenant (decision Q2-A)', () => {
    let db;
    async function exec(sql) {
        const client = new pg.Client({ connectionString: db.url });
        await client.connect();
        try {
            await client.query(sql);
        }
        finally {
            await client.end();
        }
    }
    beforeAll(async () => {
        db = await createThrowawayDatabase(OWNER_DATABASE_URL, 'momo_dev_tenant_probe');
        await exec('create table tenant (id text primary key)');
    });
    afterAll(async () => {
        await db?.drop();
    });
    it('is false while the tenant table is empty — the seed runs', async () => {
        expect(await databaseHoldsATenant(db.url)).toBe(false);
    });
    it('is true once one Tenant exists — the seed is skipped', async () => {
        await exec(`insert into tenant (id) values ('t-1')`);
        expect(await databaseHoldsATenant(db.url)).toBe(true);
    });
});
describe('databaseHoldsATenant on an unreachable database', () => {
    it('rejects rather than reading "empty" (which would run the TRUNCATEing seed)', async () => {
        // Port 1 on loopback: nothing listens there, so the connection is refused at once.
        await expect(databaseHoldsATenant('postgres://momo:momo@127.0.0.1:1/none')).rejects.toThrow();
    });
});
