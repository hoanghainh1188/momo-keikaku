/**
 * Story 2.14 — predecessor-set apply + constraint patch through the fence; FR-6a keep-text
 * refuse; Exception cell after an impossible must_* constraint.
 */
import { describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { applyPlanChange } from '../../packages/app/src/schedule/apply-plan-change';
import { applyPredecessorSet } from '../../packages/app/src/schedule/apply-predecessor-set';
import { getPlanGridState } from '../../packages/app/src/schedule/plan-grid';
import { getDb } from '../../packages/db/src/client';
import { assertProbeTenantsDisjoint, buildProbeTenant, createProbeTenant, } from '../../packages/db/src/probe-tenants';
import * as s from '../../packages/db/src/schema';
import { inTenantTransaction } from '../../packages/db/src/tenant-transaction';
import { withTenant } from '../../packages/db/src/with-tenant';
import { connectFenceHarness, installFenceAfterAll, pmCtx, } from './fence-harness';
const OWNER_DATABASE_URL = process.env.DATABASE_URL;
const APP_DATABASE_URL = process.env.APP_DATABASE_URL;
const { reachable } = await connectFenceHarness({
    ownerUrl: OWNER_DATABASE_URL,
    appUrl: APP_DATABASE_URL,
    requireDb: process.env.REQUIRE_DB === '1',
});
const PROBE = buildProbeTenant('xtprobe-s214', 956_000_000);
assertProbeTenantsDisjoint([PROBE]);
await installFenceAfterAll({ reachable, ownerUrl: OWNER_DATABASE_URL, probe: PROBE });
const ctx = () => pmCtx(PROBE, { userId: 'user-s214' });
async function prepareTwoLeaves(owner) {
    await createProbeTenant(owner, PROBE);
    const leaves = PROBE.state.wps.filter((w) => w.isLeaf && !w.isMilestone).slice(0, 2);
    if (leaves.length < 2)
        throw new Error('need two leaves');
    await withTenant(owner, PROBE.tenantId, async (tx) => {
        await tx
            .update(s.project)
            .set({ projectStart: '2026-09-01', dataDate: '2026-10-05', projectFinish: null })
            .where(eq(s.project.id, PROBE.projectId));
        for (const leaf of leaves) {
            await tx
                .update(s.workPackage)
                .set({ durationDays: 3, constraintType: 'asap', constraintDate: null })
                .where(and(eq(s.workPackage.tenantId, PROBE.tenantId), eq(s.workPackage.projectId, PROBE.projectId), eq(s.workPackage.id, leaf.id)));
        }
    });
    return leaves;
}
describe.skipIf(!reachable)('predecessor set + constraint editors (story 2.14)', () => {
    it('adds a predecessor via typed WBS and canonicalises on the grid', async () => {
        const owner = getDb(OWNER_DATABASE_URL);
        const app = getDb(APP_DATABASE_URL);
        const [pred, succ] = await prepareTwoLeaves(owner);
        const applied = await applyPredecessorSet({ handle: app, transaction: inTenantTransaction }, ctx(), {
            projectId: PROBE.projectId,
            successorWpId: succ.id,
            text: `${pred.wbsCode}FS+2d`,
        });
        expect(applied.ok).toBe(true);
        if (!applied.ok)
            return;
        const grid = await getPlanGridState({ handle: app, transaction: inTenantTransaction }, ctx(), { projectId: PROBE.projectId });
        expect(grid.ok).toBe(true);
        if (!grid.ok)
            return;
        const row = grid.value.rows.find((r) => r.wpId === succ.id);
        expect(row?.predecessorsText).toBe(`${pred.wbsCode}FS+2d`);
        expect(row?.predecessorEdges).toEqual([{ predecessorWpId: pred.id, lagDays: 2 }]);
        expect(grid.value.leafCandidates.every((c) => c.wpId !== undefined)).toBe(true);
        expect(grid.value.leafCandidates.some((c) => c.wpId === pred.id)).toBe(true);
        // Summaries never appear in autocomplete candidates.
        const summaryIds = new Set(PROBE.state.wps.filter((w) => !w.isLeaf).map((w) => w.id));
        expect(grid.value.leafCandidates.every((c) => !summaryIds.has(c.wpId))).toBe(true);
    });
    it('FR-6a cycle refuse keeps no write and returns UX prose in details.refuse', async () => {
        const owner = getDb(OWNER_DATABASE_URL);
        const app = getDb(APP_DATABASE_URL);
        const [a, b] = await prepareTwoLeaves(owner);
        // Seed A → B, then try to close B → A via typed predecessors on A.
        const seed = await applyPlanChange({ handle: app, transaction: inTenantTransaction }, ctx(), {
            kind: 'add_dependency',
            projectId: PROBE.projectId,
            predecessorWpId: a.id,
            successorWpId: b.id,
            lagDays: 0,
        });
        expect(seed.ok).toBe(true);
        const before = await withTenant(app, PROBE.tenantId, async (tx) => tx.select({ seq: s.scheduleRun.seq }).from(s.scheduleRun));
        const refused = await applyPredecessorSet({ handle: app, transaction: inTenantTransaction }, ctx(), {
            projectId: PROBE.projectId,
            successorWpId: a.id,
            text: b.wbsCode,
        });
        expect(refused.ok).toBe(false);
        if (refused.ok)
            return;
        expect(refused.error.code).toBe('invalid_input');
        expect(refused.error.details?.refuse?.[0]).toMatch(/would be a cycle/);
        const after = await withTenant(app, PROBE.tenantId, async (tx) => tx.select({ seq: s.scheduleRun.seq }).from(s.scheduleRun));
        expect(after).toEqual(before);
    });
    it('remove_dependency via empty predecessor text clears the edge', async () => {
        const owner = getDb(OWNER_DATABASE_URL);
        const app = getDb(APP_DATABASE_URL);
        const [pred, succ] = await prepareTwoLeaves(owner);
        const seeded = await applyPredecessorSet({ handle: app, transaction: inTenantTransaction }, ctx(), {
            projectId: PROBE.projectId,
            successorWpId: succ.id,
            text: pred.wbsCode,
        });
        expect(seeded.ok).toBe(true);
        const cleared = await applyPredecessorSet({ handle: app, transaction: inTenantTransaction }, ctx(), {
            projectId: PROBE.projectId,
            successorWpId: succ.id,
            text: '',
        });
        expect(cleared.ok).toBe(true);
        const grid = await getPlanGridState({ handle: app, transaction: inTenantTransaction }, ctx(), { projectId: PROBE.projectId });
        expect(grid.ok).toBe(true);
        if (!grid.ok)
            return;
        const row = grid.value.rows.find((r) => r.wpId === succ.id);
        expect(row?.predecessorEdges).toEqual([]);
        expect(row?.predecessorsText).toBe('');
    });
    it('re_lag_dependency via typed lag updates lagDays and canonical text', async () => {
        const owner = getDb(OWNER_DATABASE_URL);
        const app = getDb(APP_DATABASE_URL);
        const [pred, succ] = await prepareTwoLeaves(owner);
        const seeded = await applyPredecessorSet({ handle: app, transaction: inTenantTransaction }, ctx(), {
            projectId: PROBE.projectId,
            successorWpId: succ.id,
            text: `${pred.wbsCode}FS+1d`,
        });
        expect(seeded.ok).toBe(true);
        const relagged = await applyPredecessorSet({ handle: app, transaction: inTenantTransaction }, ctx(), {
            projectId: PROBE.projectId,
            successorWpId: succ.id,
            text: `${pred.wbsCode}FS+3d`,
        });
        expect(relagged.ok).toBe(true);
        const grid = await getPlanGridState({ handle: app, transaction: inTenantTransaction }, ctx(), { projectId: PROBE.projectId });
        expect(grid.ok).toBe(true);
        if (!grid.ok)
            return;
        const row = grid.value.rows.find((r) => r.wpId === succ.id);
        expect(row?.predecessorEdges).toEqual([{ predecessorWpId: pred.id, lagDays: 3 }]);
        expect(row?.predecessorsText).toBe(`${pred.wbsCode}FS+3d`);
    });
    it('patches must_start_on / must_finish_on and clears to asap', async () => {
        const owner = getDb(OWNER_DATABASE_URL);
        const app = getDb(APP_DATABASE_URL);
        const [leaf] = await prepareTwoLeaves(owner);
        const startOn = await applyPlanChange({ handle: app, transaction: inTenantTransaction }, ctx(), {
            kind: 'patch_constraint',
            projectId: PROBE.projectId,
            wpId: leaf.id,
            constraintType: 'must_start_on',
            constraintDate: '2026-10-08',
        });
        expect(startOn.ok).toBe(true);
        let grid = await getPlanGridState({ handle: app, transaction: inTenantTransaction }, ctx(), { projectId: PROBE.projectId });
        expect(grid.ok).toBe(true);
        if (!grid.ok)
            return;
        let row = grid.value.rows.find((r) => r.wpId === leaf.id);
        expect(row?.constraintType).toBe('must_start_on');
        expect(row?.constraintDate).toBe('2026-10-08');
        expect(row?.constraintLabel).toMatch(/Must start on/);
        const set = await applyPlanChange({ handle: app, transaction: inTenantTransaction }, ctx(), {
            kind: 'patch_constraint',
            projectId: PROBE.projectId,
            wpId: leaf.id,
            constraintType: 'must_finish_on',
            constraintDate: '2026-10-10',
        });
        expect(set.ok).toBe(true);
        grid = await getPlanGridState({ handle: app, transaction: inTenantTransaction }, ctx(), { projectId: PROBE.projectId });
        expect(grid.ok).toBe(true);
        if (!grid.ok)
            return;
        row = grid.value.rows.find((r) => r.wpId === leaf.id);
        expect(row?.constraintType).toBe('must_finish_on');
        expect(row?.constraintDate).toBe('2026-10-10');
        expect(row?.constraintLabel).toMatch(/Must finish on/);
        const cleared = await applyPlanChange({ handle: app, transaction: inTenantTransaction }, ctx(), {
            kind: 'patch_constraint',
            projectId: PROBE.projectId,
            wpId: leaf.id,
            constraintType: 'asap',
            constraintDate: null,
        });
        expect(cleared.ok).toBe(true);
        grid = await getPlanGridState({ handle: app, transaction: inTenantTransaction }, ctx(), { projectId: PROBE.projectId });
        expect(grid.ok).toBe(true);
        if (!grid.ok)
            return;
        const clearedRow = grid.value.rows.find((r) => r.wpId === leaf.id);
        expect(clearedRow?.constraintType).toBe('asap');
        expect(clearedRow?.constraintDate).toBeNull();
        expect(clearedRow?.constraintLabel).toBe('As soon as possible');
    });
    it('edits a milestone target as must_finish_on in the constraint cell (no separate field)', async () => {
        const owner = getDb(OWNER_DATABASE_URL);
        const app = getDb(APP_DATABASE_URL);
        await createProbeTenant(owner, PROBE);
        const milestone = PROBE.state.wps.find((w) => w.isMilestone && w.isLeaf);
        if (!milestone)
            throw new Error('need a milestone leaf');
        await withTenant(owner, PROBE.tenantId, async (tx) => {
            await tx
                .update(s.project)
                .set({ projectStart: '2026-09-01', dataDate: '2026-10-05', projectFinish: null })
                .where(eq(s.project.id, PROBE.projectId));
        });
        const set = await applyPlanChange({ handle: app, transaction: inTenantTransaction }, ctx(), {
            kind: 'patch_constraint',
            projectId: PROBE.projectId,
            wpId: milestone.id,
            constraintType: 'must_finish_on',
            constraintDate: '2026-10-15',
        });
        expect(set.ok).toBe(true);
        const grid = await getPlanGridState({ handle: app, transaction: inTenantTransaction }, ctx(), { projectId: PROBE.projectId });
        expect(grid.ok).toBe(true);
        if (!grid.ok)
            return;
        const row = grid.value.rows.find((r) => r.wpId === milestone.id);
        expect(row?.isMilestone).toBe(true);
        expect(row?.isLeaf).toBe(true);
        expect(row?.constraintType).toBe('must_finish_on');
        expect(row?.constraintDate).toBe('2026-10-15');
        expect(row?.constraintLabel).toMatch(/Must finish on/);
    });
    it('summary rows stay non-leaf and never enter leaf autocomplete candidates', async () => {
        const owner = getDb(OWNER_DATABASE_URL);
        const app = getDb(APP_DATABASE_URL);
        await prepareTwoLeaves(owner);
        const grid = await getPlanGridState({ handle: app, transaction: inTenantTransaction }, ctx(), { projectId: PROBE.projectId });
        expect(grid.ok).toBe(true);
        if (!grid.ok)
            return;
        const summary = grid.value.rows.find((r) => !r.isLeaf);
        expect(summary).toBeDefined();
        expect(summary?.isLeaf).toBe(false);
        expect(grid.value.leafCandidates.some((c) => c.wpId === summary?.wpId)).toBe(false);
        // Editors mount only for isLeaf; summaries keep named em-dash cells in the treegrid.
        expect(grid.value.rows.some((r) => r.isLeaf)).toBe(true);
    });
    it('impossible must_finish_on paints Exception on the same grid read', async () => {
        const owner = getDb(OWNER_DATABASE_URL);
        const app = getDb(APP_DATABASE_URL);
        const leaves = PROBE.state.wps.filter((w) => w.isLeaf && !w.isMilestone).slice(0, 2);
        await createProbeTenant(owner, PROBE);
        const [pred, succ] = leaves;
        if (!pred || !succ)
            throw new Error('need two leaves');
        await withTenant(owner, PROBE.tenantId, async (tx) => {
            await tx
                .update(s.project)
                .set({ projectStart: '2026-09-01', dataDate: '2026-09-01', projectFinish: null })
                .where(eq(s.project.id, PROBE.projectId));
            await tx
                .update(s.workPackage)
                .set({ durationDays: 10, constraintType: 'asap', constraintDate: null })
                .where(and(eq(s.workPackage.tenantId, PROBE.tenantId), eq(s.workPackage.projectId, PROBE.projectId), eq(s.workPackage.id, pred.id)));
            await tx
                .update(s.workPackage)
                .set({ durationDays: 5, constraintType: 'asap', constraintDate: null })
                .where(and(eq(s.workPackage.tenantId, PROBE.tenantId), eq(s.workPackage.projectId, PROBE.projectId), eq(s.workPackage.id, succ.id)));
            await tx.insert(s.wpDependency).values({
                tenantId: PROBE.tenantId,
                projectId: PROBE.projectId,
                predecessorWpId: pred.id,
                successorWpId: succ.id,
                type: 'FS',
                lagDays: 0,
                predIsLeaf: true,
                succIsLeaf: true,
            });
        });
        // Seed a schedule, then pin succ to a date the predecessor chain cannot meet.
        const seeded = await applyPlanChange({ handle: app, transaction: inTenantTransaction }, ctx(), {
            kind: 'patch_duration',
            projectId: PROBE.projectId,
            wpId: pred.id,
            durationDays: 10,
        });
        expect(seeded.ok).toBe(true);
        const constrained = await applyPlanChange({ handle: app, transaction: inTenantTransaction }, ctx(), {
            kind: 'patch_constraint',
            projectId: PROBE.projectId,
            wpId: succ.id,
            constraintType: 'must_finish_on',
            constraintDate: '2026-09-02',
        });
        expect(constrained.ok).toBe(true);
        const grid = await getPlanGridState({ handle: app, transaction: inTenantTransaction }, ctx(), { projectId: PROBE.projectId });
        expect(grid.ok).toBe(true);
        if (!grid.ok)
            return;
        const row = grid.value.rows.find((r) => r.wpId === succ.id);
        expect(row?.exception?.kind).toBe('violation');
        expect(row?.exception?.label).toMatch(/Late \d+d/);
        // Story 2.16 — rail surfaces the same violation with full fields.
        expect(grid.value.exceptions.totalCount).toBeGreaterThanOrEqual(1);
        const railV = grid.value.exceptions.violations.find((v) => v.wpId === succ.id);
        expect(railV).toBeDefined();
        expect(railV?.label).toBe(row?.exception?.label);
        expect(railV?.daysLate).toBeGreaterThan(0);
        expect(typeof railV?.daysLate).toBe('number');
        // Stored chain indexes must decode to live WP ids (story 2.16).
        expect(railV?.chain.length).toBeGreaterThan(0);
        expect(railV?.chain[0]?.wpId).toBe(pred.id);
        expect(railV?.chain[0]?.presentInLiveTree).toBe(true);
    });
    it('parse refuse for malformed predecessor text does not write', async () => {
        const owner = getDb(OWNER_DATABASE_URL);
        const app = getDb(APP_DATABASE_URL);
        const [, succ] = await prepareTwoLeaves(owner);
        const refused = await applyPredecessorSet({ handle: app, transaction: inTenantTransaction }, ctx(), {
            projectId: PROBE.projectId,
            successorWpId: succ.id,
            text: 'not-a-token!!!',
        });
        expect(refused.ok).toBe(false);
        if (refused.ok)
            return;
        expect(refused.error.details?.refuse?.[0]).toMatch(/Cannot parse|Unknown/);
    });
});
