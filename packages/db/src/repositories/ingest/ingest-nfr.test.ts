/**
 * NFR-P1 durable write-path proof (story 5.5): time `writeIngestSnapshot` for a
 * 2,000-Ticket ScopeRead. REQUIRE_DB-only — skipped locally without Postgres;
 * CI with REQUIRE_DB=1 runs it against the 5-minute budget.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import pg from 'pg';
import type { TicketObservation } from '@momo/domain';
import { hoursToMh } from '@momo/domain';
import { getDb } from '../../client';
import * as s from '../../schema';
import { acquireSeedSuiteLock, releaseSeedSuiteLock } from '../../seed-suite-lock';
import { withTenant } from '../../with-tenant';
import { ingestWriteRepositoryOn } from './index';

const REQUIRE_DB = process.env.REQUIRE_DB === '1';
const OWNER_DATABASE_URL = process.env.DATABASE_URL;
const APP_DATABASE_URL = process.env.APP_DATABASE_URL;
const TICKET_COUNT = 2_000;
const BUDGET_MS = 5 * 60 * 1000;
const TENANT = 'ten-ingest-nfr-5-5';
const PROJECT = 'prj-ingest-nfr-5-5';
const CONNECTOR = 'con-ingest-nfr-5-5';

async function reachable(url: string | undefined): Promise<boolean> {
  if (!url) return false;
  const client = new pg.Client({ connectionString: url, application_name: 'momo-ingest-nfr' });
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

afterAll(async () => {
  if (live) await releaseSeedSuiteLock();
});

function ticket(i: number): TicketObservation {
  return {
    trackerIssueId: `NFR-${i}`,
    key: `NFR-${i}`,
    title: `NFR ${i}`,
    statusId: 'Open',
    estimateMh: null,
    actualMh: hoursToMh(2),
    assigneeAccountId: null,
    createdAt: '2026-06-01T00:00:00.000Z',
    parentIssueId: null,
    issueTypeId: 'Task',
    trackerProjectId: null,
    attributes: [],
  };
}

describe.skipIf(!live)('NFR-P1 writeIngestSnapshot (story 5.5, REQUIRE_DB)', () => {
  beforeAll(async () => {
    const client = new pg.Client({ connectionString: OWNER_DATABASE_URL });
    await client.connect();
    try {
      await client.query(`SELECT set_config('app.maintenance', 'on', false)`);
      await client.query(`DELETE FROM actuals_ledger_entry WHERE tenant_id = $1`, [TENANT]);
      await client.query(`DELETE FROM ticket_observation WHERE tenant_id = $1`, [TENANT]);
      await client.query(`DELETE FROM tracker_snapshot WHERE tenant_id = $1`, [TENANT]);
      await client.query(`DELETE FROM ticket WHERE tenant_id = $1`, [TENANT]);
      await client.query(`DELETE FROM tracker_account WHERE tenant_id = $1`, [TENANT]);
      await client.query(`DELETE FROM project_setting_event WHERE tenant_id = $1`, [TENANT]);
      await client.query(`DELETE FROM connector_scope_event WHERE tenant_id = $1`, [TENANT]);
      await client.query(`DELETE FROM connector WHERE tenant_id = $1`, [TENANT]);
      await client.query(`DELETE FROM project WHERE id = $1`, [PROJECT]);
      await client.query(`DELETE FROM department WHERE id = $1`, [`dep-${TENANT}`]);
      await client.query(`DELETE FROM tenant WHERE id = $1`, [TENANT]);

      await client.query(`INSERT INTO tenant (id, name) VALUES ($1, 'ingest-nfr')`, [TENANT]);
      await client.query(
        `INSERT INTO department (id, tenant_id, name) VALUES ($1, $2, 'd')`,
        [`dep-${TENANT}`, TENANT],
      );
      await client.query(
        `INSERT INTO project (
           id, tenant_id, department_id, name, client_name, contract_type,
           tz_offset_minutes, teirei_weekday, default_rate_jpy, eac_method,
           calendar_jp, calendar_vn, demo_anchor
         ) VALUES (
           $1, $2, $3, 'nfr', 'c', '準委任', 540, 4, 4000, 'typical',
           true, true, '2026-09-01T00:00:00Z'
         )`,
        [PROJECT, TENANT, `dep-${TENANT}`],
      );
      await client.query(
        `INSERT INTO connector (
           id, tenant_id, project_id, adapter, site, scope, space_label,
           approval_recorded_at, approval_name
         ) VALUES (
           $1, $2, $3, 'fixture', 'nfr-site', 'NFR', 'nfr-site',
           '2026-09-01T00:00:00Z', 'nfr'
         )`,
        [CONNECTOR, TENANT, PROJECT],
      );
      await client.query(
        `INSERT INTO connector_scope_event (tenant_id, connector_id, project_id, scope, actor, at)
         VALUES ($1, $2, $3, 'NFR', 'user:nfr', '2026-09-01T00:00:00Z')`,
        [TENANT, CONNECTOR, PROJECT],
      );
    } finally {
      await client.end();
    }
  });

  it(`writes ${TICKET_COUNT} tickets to the ledger within 5 minutes`, async () => {
    const db = getDb(APP_DATABASE_URL!);
    const tickets = Array.from({ length: TICKET_COUNT }, (_, i) => ticket(i));
    let id = 0;
    const started = performance.now();
    await withTenant(db, TENANT, async (tx) => {
      const repo = ingestWriteRepositoryOn({ tx, tenantId: TENANT });
      const result = await repo.writeIngestSnapshot({
        projectId: PROJECT,
        connectorId: CONNECTOR,
        read: {
          complete: true,
          observedAt: '2026-09-01T09:00:00.000Z',
          tickets,
          accounts: [],
          hoursFieldPresent: true,
          adapterKind: 'fixture',
        },
        snapshotId: 'snap-nfr-5-5',
        nextId: () => `nfr-id-${(id += 1)}`,
        actor: 'user:nfr',
        at: new Date('2026-09-01T09:00:00.000Z'),
      });
      expect(result).toEqual({ kind: 'written', snapshotId: 'snap-nfr-5-5' });
    });
    const elapsed = performance.now() - started;
    expect(elapsed).toBeLessThan(BUDGET_MS);

    await withTenant(db, TENANT, async (tx) => {
      const [snap] = await tx
        .select({ ticketCount: s.trackerSnapshot.ticketCount })
        .from(s.trackerSnapshot)
        .where(
          and(eq(s.trackerSnapshot.tenantId, TENANT), eq(s.trackerSnapshot.id, 'snap-nfr-5-5')),
        );
      expect(snap?.ticketCount).toBe(TICKET_COUNT);
    });
  });
});
