/**
 * The repository reads a Baseline that IS present (story 2.2, review pass 1).
 *
 * The seeded demo holds no Baseline until Epic 4 (story 2.1, decision 2-A), so every other DB
 * test exercises only the no-Baseline branch of `loadProjectBundle`. This suite writes, as the
 * owner, the rows a Baseline's foreign keys need — a `holiday_calendar_version` and a
 * `schedule_run` — then two `baseline_version` rows with `baseline_wp` children, and reads the
 * bundle back as the RESTRICTED application role. The active Baseline is the one with the
 * higher `seq` (AD-7), never the one read last or recorded last.
 */
import { afterAll, describe, expect, it } from 'vitest';
import { closeAllPools, getDb, getPool } from './client';
import { assertProbeTenantsDisjoint, buildProbeTenant, createProbeTenant, removeProbeTenant, } from './probe-tenants';
import { loadProjectBundle } from './repo';
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
const PROBE = buildProbeTenant('xtprobe-rdbl', 930_000_000);
assertProbeTenantsDisjoint([PROBE]);
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
describe.skipIf(!reachable)('loadProjectBundle with Baselines present (story 2.2)', () => {
    it('returns the higher-seq version as the active Baseline, with bigint effort', async () => {
        const owner = getDb(OWNER_DATABASE_URL);
        await createProbeTenant(owner, PROBE);
        const leaves = PROBE.state.wps.filter((w) => w.isLeaf && !w.isMilestone).slice(0, 2);
        if (leaves.length < 2)
            throw new Error('the fixture no longer carries two leaf WPs');
        const scope = { tenantId: PROBE.tenantId, projectId: PROBE.projectId };
        const at = new Date('2026-06-05T02:00:00.000Z');
        const seqs = await withTenant(owner, PROBE.tenantId, async (tx) => {
            const [calendar] = await tx
                .insert(s.holidayCalendarVersion)
                .values({
                ...scope,
                nonWorkingDays: [],
                rangeStart: '2026-01-01',
                rangeEnd: '2026-12-31',
                nationalSets: ['jp'],
                nationalDatasetVersion: 'test',
                actor: 'test',
                at,
            })
                .returning({ seq: s.holidayCalendarVersion.seq });
            const [run] = await tx
                .insert(s.scheduleRun)
                .values({
                ...scope,
                holidayCalendarVersionSeq: calendar.seq,
                cause: 'test',
                actor: 'test',
                at,
                inputs: {},
                engineVersion: 'test',
            })
                .returning({ seq: s.scheduleRun.seq });
            const versions = await tx
                .insert(s.baselineVersion)
                .values([
                { ...scope, id: 'bl-first', scheduleRunSeq: run.seq, reason: 'first', recordedAt: at, actor: 'test' },
                { ...scope, id: 'bl-second', scheduleRunSeq: run.seq, reason: 'second', recordedAt: at, actor: 'test' },
            ])
                .returning({ id: s.baselineVersion.id, seq: s.baselineVersion.seq });
            const seqOf = (id) => versions.find((v) => v.id === id).seq;
            const row = (version, wpIndex, hours) => ({
                ...scope,
                id: `${PROBE.token}-${version}-${wpIndex}`,
                baselineVersionSeq: seqOf(version),
                wpId: leaves[wpIndex].id,
                start: '2026-06-01',
                finish: '2026-06-12',
                baselineMh: hours,
                isMilestone: false,
                isCatchAll: false,
            });
            await tx
                .insert(s.baselineWp)
                .values([
                row('bl-first', 0, 10000n),
                row('bl-second', 0, 20000n),
                row('bl-second', 1, 30000n),
            ]);
            return { first: seqOf('bl-first'), second: seqOf('bl-second') };
        });
        expect(seqs.second).toBeGreaterThan(seqs.first);
        const bundle = await loadProjectBundle(getDb(APP_DATABASE_URL), PROBE.tenantId, PROBE.projectId);
        expect(bundle.input.baselineVersions.map((b) => b.seq)).toEqual([seqs.first, seqs.second]);
        expect(bundle.input.activeBaselineSeq).toBe(seqs.second);
        expect(bundle.baseline?.id).toBe('bl-second');
        expect(bundle.baseline?.seq).toBe(seqs.second);
        expect(bundle.meta.baselineReason).toBe('second');
        const wps = bundle.baseline?.wps ?? [];
        expect(wps).toHaveLength(2);
        for (const b of wps) {
            expect(typeof b.baselineMh, 'baseline_mh must cross the driver as a bigint').toBe('bigint');
        }
        expect(wps.map((b) => b.baselineMh).sort()).toEqual([20000n, 30000n]);
    });
});
