/**
 * The head `wp_status_event` is a Work Package's actual state (AD-25), and the repository reads it
 * as such (story 2.2; deferred from 2.1's review, finding #3).
 *
 * Each event restates the WP's WHOLE actual state, so the head — the highest `seq` for that WP —
 * is the state, and every earlier event is history. The repository reads the events ascending by
 * `seq` and lets the last one per WP win. This suite pins that against the database rather than
 * against the reader's code:
 *
 *   * two events for one milestone, whose `seq` order DISAGREES with both their insertion order
 *     and their `at` order, so a reader keyed on either of those would pick the other date;
 *   * a head event with an actual start and finish on a leaf that is not a milestone, after an
 *     earlier event with a different start — the head's start reads back, and the leaf is
 *     "marked complete" for EVM, never a milestone's done date.
 *
 * It writes its own probe Tenant (a relabelled copy of the demo) as the owner, adds the events,
 * and reads back through `loadProjectBundle` as the RESTRICTED application role.
 */
import { afterAll, describe, expect, it } from 'vitest';
import { computeReview, isMarkedComplete } from '@momo/domain';
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
const PROBE = buildProbeTenant('xtprobe-head', 920_000_000);
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
/** A milestone the fixture never reached, and a non-milestone leaf with no actual dates. */
function targets() {
    const milestone = PROBE.state.wps.find((w) => w.isMilestone && w.actualStart === null && w.actualFinish === null);
    const leaf = PROBE.state.wps.find((w) => w.isLeaf && !w.isMilestone && !w.isCatchAll && w.actualFinish === null);
    if (!milestone || !leaf)
        throw new Error('the fixture no longer carries the WPs this suite needs');
    return { milestone, leaf };
}
describe.skipIf(!reachable)('the head wp_status_event is the actual state (story 2.2)', () => {
    it('takes the highest seq per WP, and a non-milestone WP carries no milestone date', async () => {
        const owner = getDb(OWNER_DATABASE_URL);
        await createProbeTenant(owner, PROBE);
        const { milestone, leaf } = targets();
        const base = {
            tenantId: PROBE.tenantId,
            projectId: PROBE.projectId,
            source: 'test',
            actor: 'test',
            actualStart: null,
        };
        const band = PROBE.writeOptions.seqOffset;
        // Inserted in this order on purpose: the HEAD (higher seq) goes in first and carries the
        // EARLIER `at`, so neither insertion order nor `at` would select it — only `seq` does.
        await withTenant(owner, PROBE.tenantId, (tx) => tx
            .insert(s.wpStatusEvent)
            .overridingSystemValue()
            .values([
            {
                ...base,
                seq: band + 20,
                wpId: milestone.id,
                actualFinish: '2026-09-12',
                at: new Date('2026-09-01T00:00:00.000Z'),
            },
            {
                ...base,
                seq: band + 10,
                wpId: milestone.id,
                actualFinish: '2026-09-10',
                at: new Date('2026-09-15T00:00:00.000Z'),
            },
            // The leaf: an earlier event with a different actual start, then the head, which
            // restates the start it settled on and adds the finish.
            {
                ...base,
                seq: band + 25,
                wpId: leaf.id,
                actualStart: '2026-08-01',
                actualFinish: null,
                at: new Date('2026-08-01T00:00:00.000Z'),
            },
            {
                ...base,
                seq: band + 30,
                wpId: leaf.id,
                actualStart: '2026-08-03',
                actualFinish: '2026-09-11',
                at: new Date('2026-09-11T00:00:00.000Z'),
            },
        ]));
        const bundle = await loadProjectBundle(getDb(APP_DATABASE_URL), PROBE.tenantId, PROBE.projectId);
        const read = (id) => {
            const wp = bundle.wps.find((w) => w.id === id);
            if (!wp)
                throw new Error(`work package ${id} was not read back`);
            return wp;
        };
        // Head selection: the higher seq's date, although it was inserted first and is older by `at`.
        const m = read(milestone.id);
        expect(m.actualFinish, 'the milestone must carry its head event\'s date').toBe('2026-09-12');
        expect(m.actualStart).toBeNull();
        expect(isMarkedComplete(m), 'a milestone\'s done date lifts no cap').toBe(false);
        // A non-milestone leaf with an actual finish is PM-complete, not a milestone.
        const l = read(leaf.id);
        expect(l.isMilestone).toBe(false);
        expect(l.actualStart, 'the head event\'s actual start, not the earlier one').toBe('2026-08-03');
        expect(l.actualFinish).toBe('2026-09-11');
        expect(isMarkedComplete(l), 'an actual finish on a non-milestone is "marked complete"').toBe(true);
        // Judged through the Review with the fixture's Baseline supplied (the database holds none,
        // decision 2-A): the milestone is done on its head date, and the leaf is no milestone row.
        const review = computeReview({
            ...bundle.input,
            baselineVersions: PROBE.state.baselineVersions,
            activeBaselineSeq: PROBE.state.activeBaselineSeq,
        });
        const rows = review.milestones ?? [];
        expect(rows.find((row) => row.name === milestone.name)).toMatchObject({
            doneDate: '2026-09-12',
            slipped: false,
        });
        expect(rows.map((row) => row.name)).not.toContain(leaf.name);
    });
});
