/**
 * Story 5.15 decision 4: the Review pins ITS OWN Project's latest snapshot.
 *
 * `loadBundleInTenant` used to pin the Tenant-wide latest `tracker_snapshot`, so in a Tenant with
 * two Projects the Review of one could read the other's Tickets (found on the load fixture: load
 * Project 2 pinned Project 1's week-5 snapshot and counted all 2,000 Tickets as Unmapped).
 *
 * This suite writes a relabelled demo probe Tenant (Project A), adds a second Project B with its
 * own Connector and a snapshot NEWER than every one of A's, and reads both Reviews back as the
 * restricted application role. Each must pin its own snapshot.
 */
import { afterAll, describe, expect, it } from 'vitest';
import { closeAllPools, getDb, getPool } from './client';
import { assertProbeTenantsDisjoint, buildProbeTenant, createProbeTenant, removeProbeTenant, } from './probe-tenants';
import { loadReview } from './repo';
import * as s from './schema';
import { acquireSeedSuiteLock, releaseSeedSuiteLock } from './seed-suite-lock';
import { withTenant } from './with-tenant';
const OWNER_DATABASE_URL = process.env.DATABASE_URL;
const APP_DATABASE_URL = process.env.APP_DATABASE_URL;
const REQUIRE_DB = process.env.REQUIRE_DB === '1';
async function reachableAs(connectionString) {
    if (!connectionString)
        return false;
    try {
        const client = await getPool(connectionString).connect();
        client.release();
        return true;
    }
    catch {
        return false;
    }
}
const reachable = (await reachableAs(OWNER_DATABASE_URL)) && (await reachableAs(APP_DATABASE_URL));
if (REQUIRE_DB && !reachable) {
    throw new Error('REQUIRE_DB=1 but DATABASE_URL (owner) or APP_DATABASE_URL (application role) is unreachable.');
}
/** Its own token and seq band, disjoint from every other probe suite's. */
const PROBE = buildProbeTenant('xtprobe-pin', 985_000_000);
assertProbeTenantsDisjoint([PROBE]);
const PROJECT_B = 'xtprobe-pin-project-b';
const CONNECTOR_B = 'xtprobe-pin-con-b';
const SNAPSHOT_B = 'xtprobe-pin-snap-b';
/** A third Project with no Connector at all: it must pin nothing, not the Tenant's latest. */
const PROJECT_C = 'xtprobe-pin-project-c';
// Writes a probe Tenant, so it is a probe suite and holds the seed-suite lock shared.
if (reachable) {
    await acquireSeedSuiteLock(OWNER_DATABASE_URL, 'shared');
}
afterAll(async () => {
    if (reachable) {
        await removeProbeTenant(getDb(OWNER_DATABASE_URL), PROBE).catch(() => { });
    }
    await releaseSeedSuiteLock();
    await closeAllPools();
});
describe.skipIf(!reachable)('Review snapshot pin in a multi-Project Tenant (story 5.15)', () => {
    it("pins each Project's own latest snapshot, even when the other Project's is newer", async () => {
        const owner = getDb(OWNER_DATABASE_URL);
        await createProbeTenant(owner, PROBE);
        const f = PROBE.state.fixture;
        const latestA = PROBE.state.snapshots.at(-1);
        const newer = new Date(Date.parse(latestA.observedAt) + 7 * 86_400_000);
        await withTenant(owner, PROBE.tenantId, async (tx) => {
            await tx.insert(s.project).values({
                id: PROJECT_C,
                tenantId: PROBE.tenantId,
                departmentId: f.department.id,
                programId: f.program.id,
                name: 'Project C',
                clientName: 'Client C',
                contractType: f.project.contractType,
                tzOffsetMinutes: f.project.tzOffsetMinutes,
                teireiWeekday: f.project.teireiWeekday,
                defaultRateJpy: f.project.defaultRateYenPerHour,
                eacMethod: 'typical',
                calendarJp: f.project.calendar.jp,
                calendarVn: f.project.calendar.vn,
                demoAnchor: new Date(PROBE.state.anchor),
            });
            await tx.insert(s.project).values({
                id: PROJECT_B,
                tenantId: PROBE.tenantId,
                departmentId: f.department.id,
                programId: f.program.id,
                name: 'Project B',
                clientName: 'Client B',
                contractType: f.project.contractType,
                tzOffsetMinutes: f.project.tzOffsetMinutes,
                teireiWeekday: f.project.teireiWeekday,
                defaultRateJpy: f.project.defaultRateYenPerHour,
                eacMethod: 'typical',
                calendarJp: f.project.calendar.jp,
                calendarVn: f.project.calendar.vn,
                demoAnchor: new Date(PROBE.state.anchor),
            });
            await tx.insert(s.connector).values({
                id: CONNECTOR_B,
                tenantId: PROBE.tenantId,
                projectId: PROJECT_B,
                adapter: 'fixture',
                site: 'xtprobe-pin-site-b',
                scope: 'B',
                spaceLabel: 'B',
                approvalRecordedAt: new Date(PROBE.state.anchor),
                approvalName: 'fixture',
            });
            await tx.insert(s.trackerSnapshot).values({
                id: SNAPSHOT_B,
                tenantId: PROBE.tenantId,
                connectorId: CONNECTOR_B,
                observedAt: newer,
                measurementBasis: 'hours',
                ticketCount: 1,
                adapterKind: 'fixture',
                scopeSeq: null,
            });
            await tx.insert(s.ticketObservation).values({
                id: `${SNAPSHOT_B}-b-1`,
                tenantId: PROBE.tenantId,
                snapshotId: SNAPSHOT_B,
                trackerIssueId: 'b-1',
                key: 'B-1',
                title: 'B ticket',
                statusId: 'Open',
                estimateMh: null,
                actualMh: 1000n,
                assigneeAccountId: null,
                issueTypeId: 'Task',
                parentIssueId: null,
                trackerProjectId: 'B',
                attributes: [],
                createdAt: newer,
                hoursCleared: false,
            });
        });
        const app = getDb(APP_DATABASE_URL);
        const a = await loadReview(app, PROBE.tenantId, PROBE.projectId);
        expect(a.review.snapshot.id).toBe(latestA.snapshotId);
        expect(a.bundle.input.pinnedSnapshot.tickets).toHaveLength(latestA.tickets.length);
        expect(a.bundle.input.pinnedSnapshot.tickets.some((t) => t.trackerIssueId === 'b-1')).toBe(false);
        const b = await loadReview(app, PROBE.tenantId, PROJECT_B);
        expect(b.review.snapshot.id).toBe(SNAPSHOT_B);
        expect(b.bundle.input.pinnedSnapshot.tickets.map((t) => t.trackerIssueId)).toEqual(['b-1']);
        const c = await loadReview(app, PROBE.tenantId, PROJECT_C);
        expect(c.review.snapshot.id).toBe('');
        expect(c.bundle.input.pinnedSnapshot.tickets).toHaveLength(0);
        // Story 6.1 greenfield: no Connector → empty pin map, empty filtered ledger.
        expect(c.bundle.input.trackerSnapshotIdByConnector?.size ?? 0).toBe(0);
        expect(c.bundle.input.ledger).toHaveLength(0);
        expect(c.bundle.input.ledgerSeqMax ?? null).toBeNull();
    });
});
