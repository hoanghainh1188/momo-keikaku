/**
 * Story 5.1 matrix: ticket UNIQUE, upsert-only-from-observation, cursor isolation.
 * Requires Postgres (`REQUIRE_DB=1`); skipped otherwise like other catalogue tests.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import pg from 'pg';
import { closeAllPools, getDb } from '../../client';
import { removeTenant } from '../../probe-tenants';
import * as s from '../../schema';
import { withTenant } from '../../with-tenant';
import { acquireSeedSuiteLock, releaseSeedSuiteLock } from '../../seed-suite-lock';
import { fixtureCursorPortOn, trackerRepositoryOn } from './index';

const REQUIRE_DB = process.env.REQUIRE_DB === '1';
const OWNER_DATABASE_URL = process.env.DATABASE_URL;
const APP_DATABASE_URL = process.env.APP_DATABASE_URL;

/**
 * The SQLSTATE of a rejected query, through Drizzle.
 *
 * Drizzle wraps the driver error on `cause`, so asserting top-level `{ code }` alone
 * never matches the real Postgres SQLSTATE.
 */
function sqlstateOf(error: unknown): string | undefined {
  const candidates = [error, (error as { cause?: unknown } | undefined)?.cause];
  for (const candidate of candidates) {
    const code = (candidate as { code?: unknown } | undefined)?.code;
    if (typeof code === 'string') return code;
  }
  return undefined;
}

async function reachable(url: string | undefined): Promise<boolean> {
  if (!url) return false;
  const client = new pg.Client({ connectionString: url, application_name: 'momo-tracker-test' });
  try {
    await client.connect();
    return true;
  } catch {
    return false;
  } finally {
    await client.end().catch(() => {});
  }
}

const ownerOk = await reachable(OWNER_DATABASE_URL);
const appOk = await reachable(APP_DATABASE_URL);
const live = ownerOk && appOk;

if (REQUIRE_DB && !live) {
  throw new Error('REQUIRE_DB=1 but DATABASE_URL / APP_DATABASE_URL are not reachable');
}

if (live) {
  await acquireSeedSuiteLock(OWNER_DATABASE_URL!, 'shared');
}

// The Tenant goes BEFORE the lock does: a seed waiting on the exclusive lock must never see it.
afterAll(async () => {
  if (!live) return;
  try {
    await removeTenant(getDb(OWNER_DATABASE_URL!), TENANT);
  } finally {
    await releaseSeedSuiteLock();
    await closeAllPools();
  }
});

const TENANT = 'ten-tracker-5-1';
const PROJECT = 'prj-tracker-5-1';
const CONNECTOR = 'con-tracker-5-1';
const CONNECTOR_B = 'con-tracker-5-1-b';

async function asOwner(work: (client: pg.Client) => Promise<void>): Promise<void> {
  const client = new pg.Client({ connectionString: OWNER_DATABASE_URL });
  await client.connect();
  try {
    await work(client);
  } finally {
    await client.end();
  }
}

describe.skipIf(!live)('tracker identity + fixture cursor (story 5.1)', () => {
  beforeAll(async () => {
    await asOwner(async (client) => {
      await client.query(`SELECT set_config('app.tenant_id', $1, false)`, [TENANT]);
      await client.query(`DELETE FROM fixture_cursor WHERE tenant_id = $1`, [TENANT]);
      await client.query(`DELETE FROM ticket WHERE tenant_id = $1`, [TENANT]);
      await client.query(`DELETE FROM tracker_account WHERE tenant_id = $1`, [TENANT]);
      await client.query(`DELETE FROM connector WHERE tenant_id = $1`, [TENANT]);
      await client.query(`DELETE FROM project WHERE tenant_id = $1`, [TENANT]);
      await client.query(`DELETE FROM program WHERE tenant_id = $1`, [TENANT]);
      await client.query(`DELETE FROM department WHERE tenant_id = $1`, [TENANT]);
      await client.query(`DELETE FROM tenant WHERE id = $1`, [TENANT]);

      await client.query(
        `INSERT INTO tenant (id, name, currency) VALUES ($1, 'Tracker probe', 'JPY')`,
        [TENANT],
      );
      await client.query(
        `INSERT INTO department (id, tenant_id, name) VALUES ('dep-t', $1, 'D')`,
        [TENANT],
      );
      await client.query(
        `INSERT INTO program (id, tenant_id, department_id, name) VALUES ('prg-t', $1, 'dep-t', 'P')`,
        [TENANT],
      );
      await client.query(
        `INSERT INTO project (
           id, tenant_id, department_id, program_id, name, client_name, contract_type,
           tz_offset_minutes, teirei_weekday, default_rate_jpy, eac_method,
           calendar_jp, calendar_vn, demo_anchor
         ) VALUES (
           $1, $2, 'dep-t', 'prg-t', 'Tracker', 'C', '準委任',
           540, 4, 4000, 'typical', true, true, '2026-09-16T09:00:00Z'
         )`,
        [PROJECT, TENANT],
      );
      await client.query(
        `INSERT INTO connector (id, tenant_id, project_id, adapter, site, scope, space_label)
         VALUES ($1, $2, $3, 'fixture', 'fixture.site', 'EC2', 'fixture.site'),
                ($4, $2, $3, 'fixture', 'fixture.site.b', 'EC2', 'fixture.site.b')`,
        [CONNECTOR, TENANT, PROJECT, CONNECTOR_B],
      );
    });
  });

  it('enforces UNIQUE (tenant_id, tracker_kind, tracker_site, tracker_issue_id)', async () => {
    const db = getDb(APP_DATABASE_URL!);
    await withTenant(db, TENANT, async (tx) => {
      const repo = trackerRepositoryOn({ tx, tenantId: TENANT });
      await repo.upsertTicket({
        id: 'tkt-1',
        trackerKind: 'fixture',
        trackerSite: 'fixture.site',
        trackerIssueId: 'issue-1',
        ownerConnectorId: CONNECTOR,
        projectId: PROJECT,
        key: 'K-1',
      });
      try {
        await tx.execute(sql`
          INSERT INTO ticket (
            id, tenant_id, tracker_kind, tracker_site, tracker_issue_id,
            owner_connector_id, project_id, key
          ) VALUES (
            'tkt-1-dup', ${TENANT}, 'fixture', 'fixture.site', 'issue-1',
            ${CONNECTOR}, ${PROJECT}, 'K-1-dup'
          )
        `);
        expect.fail('expected UNIQUE violation');
      } catch (error) {
        expect(sqlstateOf(error)).toBe('23505');
      }
    });
  });

  it('does not overwrite owner_connector_id on conflict (story 5.6)', async () => {
    const db = getDb(APP_DATABASE_URL!);
    await withTenant(db, TENANT, async (tx) => {
      const repo = trackerRepositoryOn({ tx, tenantId: TENANT });
      await repo.upsertTicket({
        id: 'tkt-owner-1',
        trackerKind: 'fixture',
        trackerSite: 'fixture.site',
        trackerIssueId: 'issue-owner',
        ownerConnectorId: CONNECTOR,
        projectId: PROJECT,
        key: 'K-OWN',
      });
      await repo.upsertTicket({
        id: 'tkt-owner-2',
        trackerKind: 'fixture',
        trackerSite: 'fixture.site',
        trackerIssueId: 'issue-owner',
        ownerConnectorId: CONNECTOR_B,
        projectId: PROJECT,
        key: 'K-OWN-REKEY',
      });
      const [row] = await tx
        .select()
        .from(s.ticket)
        .where(eq(s.ticket.trackerIssueId, 'issue-owner'));
      expect(row!.ownerConnectorId).toBe(CONNECTOR);
      expect(row!.key).toBe('K-OWN-REKEY');
    });
  });

  it('upserts tracker_account only from observation-shaped input', async () => {
    const db = getDb(APP_DATABASE_URL!);
    await withTenant(db, TENANT, async (tx) => {
      const repo = trackerRepositoryOn({ tx, tenantId: TENANT });
      await repo.upsertTrackerAccount({
        id: 'ta-1',
        trackerKind: 'fixture',
        trackerSite: 'fixture.site',
        observation: { accountId: 'bk-1', displayName: 'One' },
      });
      await repo.upsertTrackerAccount({
        id: 'ta-1-b',
        trackerKind: 'fixture',
        trackerSite: 'fixture.site',
        observation: { accountId: 'bk-1', displayName: 'One Updated', email: 'a@example.com' },
      });
      const selected = await tx
        .select()
        .from(s.trackerAccount)
        .where(eq(s.trackerAccount.accountId, 'bk-1'));
      expect(selected).toHaveLength(1);
      expect(selected[0]!.displayName).toBe('One Updated');
      expect(selected[0]!.email).toBe('a@example.com');
    });
  });

  it('isolates fixture cursors per connector', async () => {
    const db = getDb(APP_DATABASE_URL!);
    await withTenant(db, TENANT, async (tx) => {
      const cursor = fixtureCursorPortOn({ tx, tenantId: TENANT });
      expect(await cursor.get(CONNECTOR)).toBe(0);
      await cursor.set(CONNECTOR, 3);
      expect(await cursor.get(CONNECTOR)).toBe(3);
      expect(await cursor.get(CONNECTOR_B)).toBe(0);
      await cursor.set(CONNECTOR_B, 1);
      expect(await cursor.get(CONNECTOR)).toBe(3);
      expect(await cursor.get(CONNECTOR_B)).toBe(1);
    });
  });
});
