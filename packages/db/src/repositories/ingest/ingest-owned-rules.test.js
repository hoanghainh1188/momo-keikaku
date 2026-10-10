/**
 * Epic-5-retro F3: writeIngestSnapshot must not append rule Mapping events for overlap
 * (owner) Tickets. REQUIRE_DB-only — skipped without Postgres; CI with REQUIRE_DB=1 runs it.
 *
 * Reverting ingest to `tickets: input.read.tickets` (full snap) fails this assert.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import pg from 'pg';
import { hoursToMh } from '@momo/domain';
import { closeAllPools, getDb } from '../../client';
import { removeTenant } from '../../probe-tenants';
import * as s from '../../schema';
import { acquireSeedSuiteLock, releaseSeedSuiteLock } from '../../seed-suite-lock';
import { withTenant } from '../../with-tenant';
import { ingestWriteRepositoryOn } from './index';
const REQUIRE_DB = process.env.REQUIRE_DB === '1';
const OWNER_DATABASE_URL = process.env.DATABASE_URL;
const APP_DATABASE_URL = process.env.APP_DATABASE_URL;
const TENANT = 'ten-ingest-f3-owned';
const PROJECT = 'prj-ingest-f3-owned';
const OWNER_CON = 'con-ingest-f3-owner';
const CLAIMER_CON = 'con-ingest-f3-claimer';
const SITE = 'f3-owned-site';
const WP = 'wp-ingest-f3';
const RULE = 'rule-ingest-f3';
const OWNER_ISSUE = 'OWNED-BY-A';
const FRESH_ISSUE = 'FRESH-ON-B';
async function reachable(url) {
    if (!url)
        return false;
    const client = new pg.Client({ connectionString: url, application_name: 'momo-ingest-f3' });
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
function obs(issueId, issueTypeId) {
    return {
        trackerIssueId: issueId,
        key: issueId,
        title: issueId,
        statusId: 'Open',
        estimateMh: null,
        actualMh: hoursToMh(1),
        assigneeAccountId: null,
        createdAt: '2026-06-01T00:00:00.000Z',
        parentIssueId: null,
        issueTypeId,
        trackerProjectId: null,
        attributes: [],
    };
}
describe.skipIf(!live)('writeIngestSnapshot owned-only applyRules (epic-5-retro F3)', () => {
    beforeAll(async () => {
        const client = new pg.Client({ connectionString: OWNER_DATABASE_URL });
        await client.connect();
        try {
            await client.query(`SELECT set_config('app.maintenance', 'on', false)`);
            await client.query(`DELETE FROM mapping_event WHERE tenant_id = $1`, [TENANT]);
            await client.query(`DELETE FROM mapping_head WHERE tenant_id = $1`, [TENANT]);
            await client.query(`DELETE FROM mapping_rule WHERE tenant_id = $1`, [TENANT]);
            await client.query(`DELETE FROM connector_overlap WHERE tenant_id = $1`, [TENANT]);
            await client.query(`DELETE FROM actuals_ledger_entry WHERE tenant_id = $1`, [TENANT]);
            await client.query(`DELETE FROM ticket_observation WHERE tenant_id = $1`, [TENANT]);
            await client.query(`DELETE FROM tracker_snapshot WHERE tenant_id = $1`, [TENANT]);
            await client.query(`DELETE FROM ticket WHERE tenant_id = $1`, [TENANT]);
            await client.query(`DELETE FROM project_setting_event WHERE tenant_id = $1`, [TENANT]);
            await client.query(`DELETE FROM connector_scope_event WHERE tenant_id = $1`, [TENANT]);
            await client.query(`DELETE FROM work_package WHERE tenant_id = $1`, [TENANT]);
            await client.query(`DELETE FROM connector WHERE tenant_id = $1`, [TENANT]);
            await client.query(`DELETE FROM project WHERE id = $1`, [PROJECT]);
            await client.query(`DELETE FROM department WHERE id = $1`, [`dep-${TENANT}`]);
            await client.query(`DELETE FROM tenant WHERE id = $1`, [TENANT]);
            await client.query(`INSERT INTO tenant (id, name) VALUES ($1, 'ingest-f3')`, [TENANT]);
            await client.query(`INSERT INTO department (id, tenant_id, name) VALUES ($1, $2, 'd')`, [`dep-${TENANT}`, TENANT]);
            await client.query(`INSERT INTO project (
           id, tenant_id, department_id, name, client_name, contract_type,
           tz_offset_minutes, teirei_weekday, default_rate_jpy, eac_method,
           calendar_jp, calendar_vn, demo_anchor
         ) VALUES (
           $1, $2, $3, 'f3', 'c', '準委任', 540, 4, 4000, 'typical',
           true, true, '2026-09-01T00:00:00Z'
         )`, [PROJECT, TENANT, `dep-${TENANT}`]);
            for (const [id, label] of [
                [OWNER_CON, 'owner'],
                [CLAIMER_CON, 'claimer'],
            ]) {
                await client.query(`INSERT INTO connector (
             id, tenant_id, project_id, adapter, site, scope, space_label,
             approval_recorded_at, approval_name
           ) VALUES (
             $1, $2, $3, 'fixture', $4, $5, $5,
             '2026-09-01T00:00:00Z', 'f3'
           )`, [id, TENANT, PROJECT, SITE, label]);
                await client.query(`INSERT INTO connector_scope_event (tenant_id, connector_id, project_id, scope, actor, at)
           VALUES ($1, $2, $3, $4, 'user:f3', '2026-09-01T00:00:00Z')`, [TENANT, id, PROJECT, label]);
            }
            await client.query(`INSERT INTO work_package (
           id, tenant_id, project_id, wbs_code, name, parent_id, child_count,
           is_milestone, is_catch_all, planned_mh, assigned_resource_ids
         ) VALUES (
           $1, $2, $3, '1.1', 'Leaf', NULL, 0, false, false, 100000, '{}'
         )`, [WP, TENANT, PROJECT]);
            await client.query(`INSERT INTO mapping_rule (
           id, tenant_id, project_id, priority, name, wp_id, match_field, match_value
         ) VALUES (
           $1, $2, $3, 1, 'Bugs to leaf', $4, 'issueType', 'Bug'
         )`, [RULE, TENANT, PROJECT, WP]);
            // Pre-seed an owner Ticket with empty mapping head — claimer must not rule-map it.
            await client.query(`INSERT INTO ticket (
           id, tenant_id, tracker_kind, tracker_site, tracker_issue_id,
           owner_connector_id, project_id, key
         ) VALUES (
           'tkt-owned-a', $1, 'fixture', $2, $3, $4, $5, $3
         )`, [TENANT, SITE, OWNER_ISSUE, OWNER_CON, PROJECT]);
        }
        finally {
            await client.end();
        }
    });
    it('does not append a rule Mapping event for an overlap Ticket the claimer sees', async () => {
        const db = getDb(APP_DATABASE_URL);
        let id = 0;
        await withTenant(db, TENANT, async (tx) => {
            const repo = ingestWriteRepositoryOn({ tx, tenantId: TENANT });
            const result = await repo.writeIngestSnapshot({
                projectId: PROJECT,
                connectorId: CLAIMER_CON,
                read: {
                    complete: true,
                    observedAt: '2026-09-01T10:00:00.000Z',
                    // Owner Ticket matches the Bug rule; fresh Ticket does not.
                    tickets: [obs(OWNER_ISSUE, 'Bug'), obs(FRESH_ISSUE, 'Task')],
                    accounts: [],
                    hoursFieldPresent: true,
                    adapterKind: 'fixture',
                },
                snapshotId: 'snap-f3-claimer',
                nextId: () => `f3-id-${(id += 1)}`,
                actor: 'user:f3',
                at: new Date('2026-09-01T10:00:00.000Z'),
            });
            expect(result).toEqual({ kind: 'written', snapshotId: 'snap-f3-claimer' });
        });
        await withTenant(db, TENANT, async (tx) => {
            const events = await tx
                .select({
                ticketId: s.mappingEvent.ticketId,
                source: s.mappingEvent.source,
                ruleId: s.mappingEvent.ruleId,
            })
                .from(s.mappingEvent)
                .where(and(eq(s.mappingEvent.tenantId, TENANT), eq(s.mappingEvent.projectId, PROJECT)));
            expect(events.map((e) => e.ticketId)).not.toContain(OWNER_ISSUE);
            expect(events.filter((e) => e.ticketId === OWNER_ISSUE)).toEqual([]);
            const overlaps = await tx
                .select({ trackerIssueId: s.connectorOverlap.trackerIssueId })
                .from(s.connectorOverlap)
                .where(and(eq(s.connectorOverlap.tenantId, TENANT), eq(s.connectorOverlap.claimerConnectorId, CLAIMER_CON)));
            expect(overlaps.map((o) => o.trackerIssueId)).toContain(OWNER_ISSUE);
        });
    });
});
