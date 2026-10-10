/**
 * Story 5.3: `connector.search_limit` round-trips through `insertConnector` at the repository
 * boundary (a stored limit, and null for a set-up without one).
 * Requires Postgres (`REQUIRE_DB=1`); skipped otherwise like other catalogue tests.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import pg from 'pg';
import { closeAllPools, getDb } from '../../client';
import { removeTenant } from '../../probe-tenants';
import * as s from '../../schema';
import { withTenant } from '../../with-tenant';
import { acquireSeedSuiteLock, releaseSeedSuiteLock } from '../../seed-suite-lock';
import { connectorWriteRepositoryOn } from './index';
const REQUIRE_DB = process.env.REQUIRE_DB === '1';
const OWNER_DATABASE_URL = process.env.DATABASE_URL;
const APP_DATABASE_URL = process.env.APP_DATABASE_URL;
async function reachable(url) {
    if (!url)
        return false;
    const client = new pg.Client({ connectionString: url, application_name: 'momo-connector-test' });
    try {
        await client.connect();
        return true;
    }
    catch {
        return false;
    }
    finally {
        await client.end().catch(() => { });
    }
}
const ownerOk = await reachable(OWNER_DATABASE_URL);
const appOk = await reachable(APP_DATABASE_URL);
const live = ownerOk && appOk;
if (REQUIRE_DB && !live) {
    throw new Error('REQUIRE_DB=1 but DATABASE_URL / APP_DATABASE_URL are not reachable');
}
if (live) {
    await acquireSeedSuiteLock(OWNER_DATABASE_URL, 'shared');
}
// The Tenant goes BEFORE the lock does: a seed waiting on the exclusive lock must never see it.
afterAll(async () => {
    if (!live)
        return;
    try {
        await removeTenant(getDb(OWNER_DATABASE_URL), TENANT);
    }
    finally {
        await releaseSeedSuiteLock();
        await closeAllPools();
    }
});
const TENANT = 'ten-connector-5-3';
const PROJECT_A = 'prj-connector-5-3-a';
const PROJECT_B = 'prj-connector-5-3-b';
async function asOwner(work) {
    const client = new pg.Client({ connectionString: OWNER_DATABASE_URL });
    await client.connect();
    try {
        await work(client);
    }
    finally {
        await client.end();
    }
}
const CREDENTIALS = {
    ciphertext: Buffer.from('cipher'),
    nonce: Buffer.from('nonce-------'),
    keyId: 'test-local',
};
describe.skipIf(!live)('connector.search_limit at the repository boundary (story 5.3)', () => {
    beforeAll(async () => {
        await asOwner(async (client) => {
            await client.query(`SELECT set_config('app.tenant_id', $1, false)`, [TENANT]);
            await client.query(`DELETE FROM connector WHERE tenant_id = $1`, [TENANT]);
            await client.query(`DELETE FROM project WHERE tenant_id = $1`, [TENANT]);
            await client.query(`DELETE FROM program WHERE tenant_id = $1`, [TENANT]);
            await client.query(`DELETE FROM department WHERE tenant_id = $1`, [TENANT]);
            await client.query(`DELETE FROM tenant WHERE id = $1`, [TENANT]);
            await client.query(`INSERT INTO tenant (id, name, currency) VALUES ($1, 'Connector probe', 'JPY')`, [TENANT]);
            await client.query(`INSERT INTO department (id, tenant_id, name) VALUES ('dep-c', $1, 'D')`, [TENANT]);
            await client.query(`INSERT INTO program (id, tenant_id, department_id, name) VALUES ('prg-c', $1, 'dep-c', 'P')`, [TENANT]);
            for (const project of [PROJECT_A, PROJECT_B]) {
                await client.query(`INSERT INTO project (
             id, tenant_id, department_id, program_id, name, client_name, contract_type,
             tz_offset_minutes, teirei_weekday, default_rate_jpy, eac_method,
             calendar_jp, calendar_vn, demo_anchor
           ) VALUES (
             $1, $2, 'dep-c', 'prg-c', 'Connector', 'C', '準委任',
             540, 4, 4000, 'typical', true, true, '2026-09-16T09:00:00Z'
           )`, [project, TENANT]);
            }
        });
    });
    it.each([
        ['con-5-3-limit', PROJECT_A, 150],
        ['con-5-3-null', PROJECT_B, null],
    ])('stores and reads back search_limit for %s', async (id, projectId, searchLimit) => {
        const db = getDb(APP_DATABASE_URL);
        const stored = await withTenant(db, TENANT, async (tx) => {
            await connectorWriteRepositoryOn({ tx, tenantId: TENANT }).insertConnector({
                id,
                projectId,
                adapter: 'backlog',
                site: 'example.backlog.jp',
                scope: 'EC2',
                spaceLabel: 'example.backlog.jp',
                approvalRecordedAt: new Date('2026-09-01T00:00:00Z'),
                approvalName: 'Client Approver',
                credentials: CREDENTIALS,
                searchLimit,
            });
            const [row] = await tx
                .select({ searchLimit: s.connector.searchLimit })
                .from(s.connector)
                .where(and(eq(s.connector.tenantId, TENANT), eq(s.connector.id, id)));
            return row;
        });
        expect(stored).toEqual({ searchLimit });
    });
});
