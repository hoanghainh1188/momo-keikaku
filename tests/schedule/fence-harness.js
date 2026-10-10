/**
 * Shared fence-suite preamble — dual-role reachability, REQUIRE_DB gate, seed-suite lock,
 * afterAll probe teardown, default PM request context, and the common schedulable-leaf prepare.
 *
 * Call order per suite: reachability (`connectFenceHarness`) → probe build →
 * `installFenceAfterAll` (lock when reachable + teardown). Test-only wiring (Epic 2 retro F6;
 * Epic 4 retro F4 lifts Baseline schedulability helpers here). Suites keep their own PROBE
 * slug/seq band and any specialized prepare. Do not import `tests/write-harness.ts` from
 * fence suites.
 */
import { afterAll, expect } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { stringify } from '@momo/domain';
import { applyPlanChange, } from '../../packages/app/src/schedule/apply-plan-change';
import { closeAllPools, getDb, getPool } from '../../packages/db/src/client';
import { createProbeTenant, removeProbeTenant, } from '../../packages/db/src/probe-tenants';
import * as s from '../../packages/db/src/schema';
import { acquireSeedSuiteLock, releaseSeedSuiteLock } from '../../packages/db/src/seed-suite-lock';
import { withTenant } from '../../packages/db/src/with-tenant';
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
/**
 * Dual-role reachability + REQUIRE_DB fail. Does not take the seed-suite lock —
 * that happens in `installFenceAfterAll` after the suite PROBE is built.
 */
export async function connectFenceHarness(env) {
    const reachable = (await reachableAs(env.ownerUrl)) && (await reachableAs(env.appUrl));
    if (env.requireDb && !reachable) {
        throw new Error('REQUIRE_DB=1 but DATABASE_URL or APP_DATABASE_URL is unreachable.');
    }
    return { reachable };
}
/**
 * When reachable, acquires the shared seed-suite lock, then registers afterAll:
 * remove probe, release seed lock, close pools.
 */
export async function installFenceAfterAll(opts) {
    if (opts.reachable) {
        await acquireSeedSuiteLock(opts.ownerUrl, 'shared');
    }
    afterAll(async () => {
        if (opts.reachable) {
            await removeProbeTenant(getDb(opts.ownerUrl), opts.probe).catch(() => { });
        }
        await releaseSeedSuiteLock();
        await closeAllPools();
    });
}
/** Default PM request context for fence suites (tenant + project from the probe). */
export function pmCtx(probe, options) {
    return {
        tenantId: probe.tenantId,
        userId: options.userId,
        roles: options.roles ?? ['pm'],
        locale: options.locale ?? 'en',
        projectIds: options.projectIds ? [...options.projectIds] : [probe.projectId],
    };
}
/**
 * Creates the probe tenant, sets Project dates 2026-09-01 / 2026-10-05, and leaf
 * durationDays: 3 ASAP. Throws if the fixture has no non-milestone leaf.
 */
export async function prepareSchedulableLeaf(owner, probe) {
    await createProbeTenant(owner, probe);
    const leaf = probe.state.wps.find((w) => w.isLeaf && !w.isMilestone);
    if (!leaf)
        throw new Error('fixture needs a leaf WP');
    await withTenant(owner, probe.tenantId, async (tx) => {
        await tx
            .update(s.project)
            .set({ projectStart: '2026-09-01', dataDate: '2026-10-05', projectFinish: null })
            .where(eq(s.project.id, probe.projectId));
        await tx
            .update(s.workPackage)
            .set({ durationDays: 3, constraintType: 'asap', constraintDate: null })
            .where(and(eq(s.workPackage.tenantId, probe.tenantId), eq(s.workPackage.projectId, probe.projectId), eq(s.workPackage.id, leaf.id)));
    });
    return leaf;
}
/**
 * Make every non-milestone leaf durationDays: 3 ASAP and every milestone leaf duration 0.
 * Epic 4 fences call this after `prepareSchedulableLeaf` so Set/Re-baseline see a complete plan.
 */
export async function makeAllLeavesSchedulable(owner, probe) {
    const leaves = probe.state.wps.filter((w) => w.isLeaf && !w.isMilestone);
    await withTenant(owner, probe.tenantId, async (tx) => {
        for (const leaf of leaves) {
            await tx
                .update(s.workPackage)
                .set({ durationDays: 3, constraintType: 'asap', constraintDate: null })
                .where(and(eq(s.workPackage.tenantId, probe.tenantId), eq(s.workPackage.projectId, probe.projectId), eq(s.workPackage.id, leaf.id)));
        }
        // Milestones stay duration 0.
        for (const m of probe.state.wps.filter((w) => w.isLeaf && w.isMilestone)) {
            await tx
                .update(s.workPackage)
                .set({ durationDays: 0, isMilestone: true })
                .where(and(eq(s.workPackage.tenantId, probe.tenantId), eq(s.workPackage.projectId, probe.projectId), eq(s.workPackage.id, m.id)));
        }
    });
}
/**
 * Patch one leaf duration through `applyPlanChange` and return the successful run seq.
 * Default durationDays is 5 (Epic 4 fence convention).
 */
export async function scheduleLeaf(deps, ctx, projectId, leafId, durationDays = 5) {
    const result = await applyPlanChange(deps, ctx, {
        kind: 'patch_duration',
        projectId,
        wpId: leafId,
        durationDays,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) {
        // AD-4: non-*.test.ts harnesses stay under the stringify fence; use the domain codec.
        expect.fail(`schedule failed: ${result.error.code} ${stringify(result.error.details ?? null)}`);
    }
    expect(result.value.kind).toBe('scheduled');
    return result.value.seq;
}
/**
 * Walk a thrown error chain for append-only / RLS refuse codes used by Baseline fence proofs.
 */
export async function refusalPgCode(promise) {
    try {
        await promise;
        return null;
    }
    catch (error) {
        const walk = (value) => {
            if (typeof value !== 'object' || value === null)
                return null;
            const record = value;
            if (typeof record.code === 'string' && /^(42501|MOMO1)$/.test(record.code)) {
                return record.code;
            }
            return walk(record.cause);
        };
        return walk(error);
    }
}
