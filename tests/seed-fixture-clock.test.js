/**
 * Story 1.8 matrix: seed under fixture Clock, and reseed seq stability without
 * `RESTART IDENTITY`. Probe seq base ≥ 870_000_000.
 *
 * Story 2.1 (decision 2-A) took the Baseline out of the seed: a Baseline now pins a `schedule_run`
 * by foreign key and no engine produces one yet. What these cases measured on the Baseline they
 * now measure on what the writer still stamps — `wp_status_event.at` for the Clock, and
 * `tracker_snapshot.seq` for fixture-relative identity values — and they pin the absence itself.
 */
import { afterAll, describe, expect, it } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { closeAllPools } from '../packages/db/src/client';
import { assertProbeTenantsDisjoint, buildProbeTenant, PROBE_SEQ_BAND_WIDTH, removeProbeTenant, } from '../packages/db/src/probe-tenants';
import * as schema from '../packages/db/src/schema';
import { writeTenantRows } from '../packages/db/src/seed';
import { withTenant } from '../packages/db/src/with-tenant';
import { releaseSeedSuiteLock } from '../packages/db/src/seed-suite-lock';
import { connectWriteHarness, owner } from './write-harness';
const reachable = await connectWriteHarness({
    ownerUrl: process.env.DATABASE_URL,
    appUrl: process.env.APP_DATABASE_URL,
    requireDb: process.env.REQUIRE_DB === '1',
}, { seedLock: 'exclusive' });
/** Story 1.8 continuity: load-fixture probes use ≥ 870_000_000. */
const PROBE = buildProbeTenant('xtprobe-s8c', 870_000_000);
assertProbeTenantsDisjoint([PROBE]);
/** Distinct from the demo fixture anchor (`2026-09-16T09:00:00.000Z`). */
const FIXTURE_CLOCK_NOW = new Date('2027-03-01T15:30:00.000Z');
const fixtureClock = { now: () => new Date(FIXTURE_CLOCK_NOW.getTime()) };
/** The first replayed snapshot's fixture-relative seq: fixture value 1 plus the probe's band. */
const expectedFirstSnapshotSeq = 1 + PROBE.writeOptions.seqOffset;
/**
 * Raises the snapshot counter to at least `past` — never lowers it. The counter is shared, and
 * the probe suites' resyncs routinely carry it far past 99,000,000 (into the 961,000,000 band), so
 * a bare `setval` here would rewind it under rows other Tenants still hold.
 */
async function advanceSnapshotIdentity(past) {
    await owner().execute(sql `SELECT setval(pg_get_serial_sequence('tracker_snapshot', 'seq'), ${past}, true)
        WHERE COALESCE(pg_sequence_last_value(pg_get_serial_sequence('tracker_snapshot', 'seq')::regclass), 0) < ${past}`);
}
async function writeProbeWithClock() {
    await removeProbeTenant(owner(), PROBE);
    await withTenant(owner(), PROBE.tenantId, (tx) => writeTenantRows(tx, PROBE.state, { ...PROBE.writeOptions, clock: fixtureClock }));
}
async function probeSnapshotSeqs() {
    const rows = await withTenant(owner(), PROBE.tenantId, (tx) => tx
        .select({ seq: schema.trackerSnapshot.seq })
        .from(schema.trackerSnapshot)
        .where(eq(schema.trackerSnapshot.tenantId, PROBE.tenantId)));
    return rows.map((row) => Number(row.seq)).sort((a, b) => a - b);
}
afterAll(async () => {
    if (!reachable)
        return;
    try {
        await removeProbeTenant(owner(), PROBE);
    }
    finally {
        try {
            await releaseSeedSuiteLock();
        }
        finally {
            await closeAllPools();
        }
    }
});
describe.skipIf(!reachable)('seed under fixture Clock (story 1.8 matrix)', () => {
    it('stamps demo_anchor and the actual-date events from the Clock; Rates keep 2026-01-01 coverage', async () => {
        await writeProbeWithClock();
        const [project] = await withTenant(owner(), PROBE.tenantId, (tx) => tx
            .select({
            demoAnchor: schema.project.demoAnchor,
        })
            .from(schema.project)
            .where(eq(schema.project.id, PROBE.projectId)));
        expect(project?.demoAnchor.toISOString()).toBe(FIXTURE_CLOCK_NOW.toISOString());
        const events = await withTenant(owner(), PROBE.tenantId, (tx) => tx
            .select({ at: schema.wpStatusEvent.at })
            .from(schema.wpStatusEvent)
            .where(eq(schema.wpStatusEvent.projectId, PROBE.projectId)));
        expect(events.length, 'the fixture records two milestone actual finishes').toBe(2);
        for (const event of events) {
            expect(event.at.toISOString()).toBe(FIXTURE_CLOCK_NOW.toISOString());
        }
        const rates = await withTenant(owner(), PROBE.tenantId, (tx) => tx
            .select({ effectiveFrom: schema.rateEntry.effectiveFrom })
            .from(schema.rateEntry)
            .where(eq(schema.rateEntry.tenantId, PROBE.tenantId)));
        expect(rates.length).toBeGreaterThan(0);
        for (const row of rates) {
            // Rate effectiveFrom stays the fixture origin; Clock stamps demo_anchor / events / audit.
            expect(row.effectiveFrom).toBe('2026-01-01');
        }
        const [projectDefault] = await withTenant(owner(), PROBE.tenantId, (tx) => tx
            .select({ effectiveFrom: schema.projectDefaultRateEntry.effectiveFrom })
            .from(schema.projectDefaultRateEntry)
            .where(eq(schema.projectDefaultRateEntry.projectId, PROBE.projectId)));
        expect(projectDefault?.effectiveFrom).toBe('2026-01-01');
    }, 120_000);
    it('writes no Baseline, and so no ledger entry names one (decision 2-A)', async () => {
        await writeProbeWithClock();
        const baselines = await withTenant(owner(), PROBE.tenantId, (tx) => tx.select().from(schema.baselineVersion).where(eq(schema.baselineVersion.tenantId, PROBE.tenantId)));
        expect(baselines).toEqual([]);
        const named = await withTenant(owner(), PROBE.tenantId, (tx) => tx
            .select({ seq: schema.actualsLedgerEntry.seq })
            .from(schema.actualsLedgerEntry)
            .where(sql `${schema.actualsLedgerEntry.tenantId} = ${PROBE.tenantId}
              AND ${schema.actualsLedgerEntry.activeBaselineVersionSeq} IS NOT NULL`));
        expect(named).toEqual([]);
    }, 120_000);
});
describe.skipIf(!reachable)('reseed seq stability without RESTART IDENTITY (story 1.8 matrix)', () => {
    it('keeps fixture-relative snapshot seqs after identity was advanced', async () => {
        await advanceSnapshotIdentity(99_000_000);
        await writeProbeWithClock();
        const seqs = await probeSnapshotSeqs();
        expect(seqs.length).toBeGreaterThan(0);
        expect(seqs[0]).toBe(expectedFirstSnapshotSeq);
        // Fixture-relative, inside this probe's own band — not a nextval from wherever the shared
        // counter stands (at least 99_000_000, and usually far above it).
        const band = PROBE.writeOptions.seqOffset;
        expect(seqs.filter((seq) => seq < band || seq >= band + PROBE_SEQ_BAND_WIDTH)).toEqual([]);
        // Reseed after delete (sequences stay advanced — no RESTART IDENTITY).
        await advanceSnapshotIdentity(99_500_000);
        await writeProbeWithClock();
        const again = await probeSnapshotSeqs();
        expect(again).toEqual(seqs);
        expect(again).not.toContain(99_500_001);
    }, 180_000);
});
