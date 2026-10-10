/**
 * Story 4.1 — setBaseline matrix: happy path, refuse incomplete / halted / second set,
 * append-only, retention pin, catch-all copy, role not_found.
 */
import { describe, expect, it } from 'vitest';
import { and, eq, sql } from 'drizzle-orm';
import { scheduleRunRetention } from '@momo/domain';
import { applyPlanChange } from '../../packages/app/src/schedule/apply-plan-change';
import { FIRST_SET_REASON, setBaseline, } from '../../packages/app/src/baseline/set-baseline';
import { getBaselineSetState } from '../../packages/app/src/baseline/set-baseline-state';
import { getDb } from '../../packages/db/src/client';
import { assertProbeTenantsDisjoint, buildProbeTenant, createProbeTenant, } from '../../packages/db/src/probe-tenants';
import { baselineRepositoryOn } from '../../packages/db/src/repositories/baseline';
import * as s from '../../packages/db/src/schema';
import { APPEND_ONLY_ERRCODE } from '../../packages/db/src/sql/generate';
import { inTenantTransaction } from '../../packages/db/src/tenant-transaction';
import { withTenant } from '../../packages/db/src/with-tenant';
import { connectFenceHarness, installFenceAfterAll, makeAllLeavesSchedulable, pmCtx, prepareSchedulableLeaf, refusalPgCode, scheduleLeaf, } from './fence-harness';
const OWNER_DATABASE_URL = process.env.DATABASE_URL;
const APP_DATABASE_URL = process.env.APP_DATABASE_URL;
const { reachable } = await connectFenceHarness({
    ownerUrl: OWNER_DATABASE_URL,
    appUrl: APP_DATABASE_URL,
    requireDb: process.env.REQUIRE_DB === '1',
});
const PROBE = buildProbeTenant('xtprobe-s41', 959_000_000);
assertProbeTenantsDisjoint([PROBE]);
await installFenceAfterAll({ reachable, ownerUrl: OWNER_DATABASE_URL, probe: PROBE });
const ctx = () => pmCtx(PROBE, { userId: 'user-s41' });
const deps = () => ({
    handle: getDb(APP_DATABASE_URL),
    transaction: inTenantTransaction,
    ids: {
        next: (() => {
            let n = 0;
            return () => `bl-s41-${++n}`;
        })(),
    },
});
describe.skipIf(!reachable)('setBaseline fence (story 4.1)', () => {
    it('happy path: pins latest successful run and writes leaf cost-projection rows', async () => {
        const owner = getDb(OWNER_DATABASE_URL);
        const leaf = await prepareSchedulableLeaf(owner, PROBE);
        await makeAllLeavesSchedulable(owner, PROBE);
        const runSeq = await scheduleLeaf(deps(), ctx(), PROBE.projectId, leaf.id);
        // Mark one leaf catch-all at set time (value-at-set-time).
        await withTenant(owner, PROBE.tenantId, async (tx) => {
            await tx
                .update(s.workPackage)
                .set({ isCatchAll: true })
                .where(and(eq(s.workPackage.tenantId, PROBE.tenantId), eq(s.workPackage.projectId, PROBE.projectId), eq(s.workPackage.id, leaf.id)));
        });
        const beforeState = await getBaselineSetState(deps(), ctx(), { projectId: PROBE.projectId });
        expect(beforeState.ok).toBe(true);
        if (beforeState.ok) {
            expect(beforeState.value.canSet).toBe(true);
            expect(beforeState.value.hasBaseline).toBe(false);
            expect(beforeState.value.exceptionsRailHref).toBe(`/p/${PROBE.projectId}/plan?exceptions=not_schedulable`);
        }
        const result = await setBaseline(deps(), ctx(), { projectId: PROBE.projectId });
        expect(result.ok).toBe(true);
        if (!result.ok) {
            expect.fail(`setBaseline failed: ${result.error.code} ${JSON.stringify(result.error.details)}`);
        }
        expect(result.value.scheduleRunSeq).toBe(runSeq);
        expect(result.value.leafCount).toBeGreaterThan(0);
        const afterState = await getBaselineSetState(deps(), ctx(), { projectId: PROBE.projectId });
        expect(afterState.ok).toBe(true);
        if (afterState.ok) {
            expect(afterState.value.canSet).toBe(false);
            expect(afterState.value.hasBaseline).toBe(true);
            expect(afterState.value.exceptionsRailHref).toBe(`/p/${PROBE.projectId}/plan?exceptions=not_schedulable`);
        }
        const versions = await withTenant(getDb(APP_DATABASE_URL), PROBE.tenantId, async (tx) => tx
            .select()
            .from(s.baselineVersion)
            .where(and(eq(s.baselineVersion.tenantId, PROBE.tenantId), eq(s.baselineVersion.projectId, PROBE.projectId))));
        expect(versions).toHaveLength(1);
        expect(versions[0].scheduleRunSeq).toBe(runSeq);
        expect(versions[0].reason).toBe(FIRST_SET_REASON);
        // Inputs are pinned by reference only — baseline_version has no inputs column.
        expect('inputs' in versions[0]).toBe(false);
        const wps = await withTenant(getDb(APP_DATABASE_URL), PROBE.tenantId, async (tx) => tx
            .select()
            .from(s.baselineWp)
            .where(and(eq(s.baselineWp.tenantId, PROBE.tenantId), eq(s.baselineWp.baselineVersionSeq, versions[0].seq))));
        const leafRow = wps.find((w) => w.wpId === leaf.id);
        expect(leafRow).toBeDefined();
        expect(leafRow.isCatchAll).toBe(true);
        expect(leafRow.start).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(leafRow.finish).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(typeof leafRow.baselineMh).toBe('bigint');
        const audits = await withTenant(getDb(APP_DATABASE_URL), PROBE.tenantId, async (tx) => tx
            .select({ action: s.auditLog.action })
            .from(s.auditLog)
            .where(and(eq(s.auditLog.tenantId, PROBE.tenantId), eq(s.auditLog.action, 'baseline.set'))));
        expect(audits).toHaveLength(1);
        // Retention: feed Baseline pins from the repository into scheduleRunRetention (AR-11).
        const { runs, pinnedSeqs } = await withTenant(getDb(APP_DATABASE_URL), PROBE.tenantId, async (tx) => {
            const bound = { tx, tenantId: PROBE.tenantId };
            const pinned = await baselineRepositoryOn(bound).pinnedScheduleRunSeqs(PROBE.projectId);
            const runRows = await tx
                .select({
                seq: s.scheduleRun.seq,
                inputs: s.scheduleRun.inputs,
                outputs: s.scheduleRun.outputs,
            })
                .from(s.scheduleRun)
                .where(and(eq(s.scheduleRun.tenantId, PROBE.tenantId), eq(s.scheduleRun.projectId, PROBE.projectId)));
            return { runs: runRows, pinnedSeqs: pinned };
        });
        expect(pinnedSeqs).toContain(runSeq);
        const decisions = scheduleRunRetention(runs.map((r) => ({
            seq: r.seq,
            hasInputs: r.inputs !== null,
            hasOutputs: r.outputs !== null,
        })), pinnedSeqs);
        const pinned = decisions.find((d) => d.seq === runSeq);
        expect(pinned?.retainInputs).toBe(true);
    });
    it('retention keeps pin + immediate prev inputs (re-derive prev older than oldest pin)', async () => {
        // Two successful runs then first Set — pin's prev_run_seq is older than the Baseline pin
        // (F8). Collector must expand pins so scheduleRunRetention retains prev inputs.
        const owner = getDb(OWNER_DATABASE_URL);
        const leaf = await prepareSchedulableLeaf(owner, PROBE);
        await makeAllLeavesSchedulable(owner, PROBE);
        const prevSeq = await scheduleLeaf(deps(), ctx(), PROBE.projectId, leaf.id, 4);
        const pinSeq = await scheduleLeaf(deps(), ctx(), PROBE.projectId, leaf.id, 7);
        expect(pinSeq).toBeGreaterThan(prevSeq);
        const set = await setBaseline(deps(), ctx(), { projectId: PROBE.projectId });
        expect(set.ok).toBe(true);
        if (!set.ok)
            return;
        expect(set.value.scheduleRunSeq).toBe(pinSeq);
        const { runs, pinnedSeqs, pinPrevRunSeq } = await withTenant(getDb(APP_DATABASE_URL), PROBE.tenantId, async (tx) => {
            const bound = { tx, tenantId: PROBE.tenantId };
            const pinned = await baselineRepositoryOn(bound).pinnedScheduleRunSeqs(PROBE.projectId);
            const runRows = await tx
                .select({
                seq: s.scheduleRun.seq,
                prevRunSeq: s.scheduleRun.prevRunSeq,
                inputs: s.scheduleRun.inputs,
                outputs: s.scheduleRun.outputs,
            })
                .from(s.scheduleRun)
                .where(and(eq(s.scheduleRun.tenantId, PROBE.tenantId), eq(s.scheduleRun.projectId, PROBE.projectId)));
            const pinRow = runRows.find((r) => r.seq === pinSeq);
            return {
                runs: runRows,
                pinnedSeqs: pinned,
                pinPrevRunSeq: pinRow?.prevRunSeq ?? null,
            };
        });
        expect(pinPrevRunSeq).toBe(prevSeq);
        expect(pinnedSeqs).toEqual(expect.arrayContaining([pinSeq, prevSeq]));
        const decisions = scheduleRunRetention(runs.map((r) => ({
            seq: r.seq,
            hasInputs: r.inputs !== null,
            hasOutputs: r.outputs !== null,
        })), pinnedSeqs);
        expect(decisions.find((d) => d.seq === pinSeq)?.retainInputs).toBe(true);
        expect(decisions.find((d) => d.seq === prevSeq)?.retainInputs).toBe(true);
    });
    it('refuses a second Set (Re-baseline is out of scope)', async () => {
        const owner = getDb(OWNER_DATABASE_URL);
        const leaf = await prepareSchedulableLeaf(owner, PROBE);
        await makeAllLeavesSchedulable(owner, PROBE);
        await scheduleLeaf(deps(), ctx(), PROBE.projectId, leaf.id);
        const first = await setBaseline(deps(), ctx(), { projectId: PROBE.projectId });
        expect(first.ok).toBe(true);
        const second = await setBaseline(deps(), ctx(), { projectId: PROBE.projectId });
        expect(second.ok).toBe(false);
        if (second.ok)
            return;
        expect(second.error.code).toBe('invalid_input');
        expect(second.error.details?.baseline).toContain('already_exists');
        const versions = await withTenant(getDb(APP_DATABASE_URL), PROBE.tenantId, async (tx) => tx
            .select({ seq: s.baselineVersion.seq })
            .from(s.baselineVersion)
            .where(and(eq(s.baselineVersion.tenantId, PROBE.tenantId), eq(s.baselineVersion.projectId, PROBE.projectId))));
        expect(versions).toHaveLength(1);
    });
    it('refuses incomplete plan (leaf missing duration) with blockers', async () => {
        const owner = getDb(OWNER_DATABASE_URL);
        await createProbeTenant(owner, PROBE);
        const leaves = PROBE.state.wps.filter((w) => w.isLeaf && !w.isMilestone);
        if (leaves.length < 2)
            throw new Error('need two leaves');
        await withTenant(owner, PROBE.tenantId, async (tx) => {
            await tx
                .update(s.project)
                .set({ projectStart: '2026-09-01', dataDate: '2026-10-05' })
                .where(eq(s.project.id, PROBE.projectId));
            await tx
                .update(s.workPackage)
                .set({ durationDays: 3, constraintType: 'asap', constraintDate: null })
                .where(and(eq(s.workPackage.tenantId, PROBE.tenantId), eq(s.workPackage.projectId, PROBE.projectId), eq(s.workPackage.id, leaves[0].id)));
            // Second leaf stays without duration.
            await tx
                .update(s.workPackage)
                .set({ durationDays: null })
                .where(and(eq(s.workPackage.tenantId, PROBE.tenantId), eq(s.workPackage.projectId, PROBE.projectId), eq(s.workPackage.id, leaves[1].id)));
        });
        await applyPlanChange(deps(), ctx(), {
            kind: 'patch_duration',
            projectId: PROBE.projectId,
            wpId: leaves[0].id,
            durationDays: 4,
        });
        const result = await setBaseline(deps(), ctx(), { projectId: PROBE.projectId });
        expect(result.ok).toBe(false);
        if (result.ok)
            return;
        expect(result.error.code).toBe('invalid_input');
        expect(result.error.details?.blockingWpIds).toContain(leaves[1].id);
        const versions = await withTenant(getDb(APP_DATABASE_URL), PROBE.tenantId, async (tx) => tx
            .select()
            .from(s.baselineVersion)
            .where(and(eq(s.baselineVersion.tenantId, PROBE.tenantId), eq(s.baselineVersion.projectId, PROBE.projectId))));
        expect(versions).toHaveLength(0);
        const state = await getBaselineSetState(deps(), ctx(), { projectId: PROBE.projectId });
        expect(state.ok).toBe(true);
        if (!state.ok)
            return;
        expect(state.value.canSet).toBe(false);
        expect(state.value.blockingWpIds).toContain(leaves[1].id);
        expect(state.value.exceptionsRailHref).toContain('exceptions=not_schedulable');
    });
    it('refuses when the latest run is halted', async () => {
        const owner = getDb(OWNER_DATABASE_URL);
        const leaf = await prepareSchedulableLeaf(owner, PROBE);
        await makeAllLeavesSchedulable(owner, PROBE);
        await scheduleLeaf(deps(), ctx(), PROBE.projectId, leaf.id);
        // Force a halted head after a successful run (calendar_range).
        const halted = await applyPlanChange(deps(), ctx(), {
            kind: 'patch_constraint',
            projectId: PROBE.projectId,
            wpId: leaf.id,
            constraintType: 'must_finish_on',
            constraintDate: '2031-06-15',
        });
        expect(halted.ok).toBe(true);
        if (!halted.ok)
            return;
        expect(halted.value.kind).toBe('halted');
        const result = await setBaseline(deps(), ctx(), { projectId: PROBE.projectId });
        expect(result.ok).toBe(false);
        if (result.ok)
            return;
        expect(result.error.code).toBe('invalid_input');
        expect(result.error.details?.baseline).toContain('halted_or_missing_run');
        const versions = await withTenant(getDb(APP_DATABASE_URL), PROBE.tenantId, async (tx) => tx
            .select()
            .from(s.baselineVersion)
            .where(and(eq(s.baselineVersion.tenantId, PROBE.tenantId), eq(s.baselineVersion.projectId, PROBE.projectId))));
        expect(versions).toHaveLength(0);
    });
    it('refuses when there is no successful schedule run', async () => {
        const owner = getDb(OWNER_DATABASE_URL);
        await prepareSchedulableLeaf(owner, PROBE);
        // No applyPlanChange — no run.
        const result = await setBaseline(deps(), ctx(), { projectId: PROBE.projectId });
        expect(result.ok).toBe(false);
        if (result.ok)
            return;
        expect(result.error.code).toBe('invalid_input');
        expect(result.error.details?.baseline).toEqual(expect.arrayContaining([expect.stringMatching(/no_successful_run|halted/)]));
    });
    it('append-only: UPDATE/DELETE on baseline tables fail as the app role', async () => {
        const owner = getDb(OWNER_DATABASE_URL);
        const leaf = await prepareSchedulableLeaf(owner, PROBE);
        await makeAllLeavesSchedulable(owner, PROBE);
        await scheduleLeaf(deps(), ctx(), PROBE.projectId, leaf.id);
        const set = await setBaseline(deps(), ctx(), { projectId: PROBE.projectId });
        expect(set.ok).toBe(true);
        if (!set.ok)
            return;
        const app = getDb(APP_DATABASE_URL);
        const seq = set.value.baselineVersionSeq;
        const updateVersionCode = await refusalPgCode(withTenant(app, PROBE.tenantId, (tx) => tx.execute(sql `UPDATE baseline_version SET reason = 'tampered' WHERE seq = ${seq}`)));
        expect(updateVersionCode, 'UPDATE baseline_version must be refused').toMatch(/^(42501|MOMO1)$/);
        const updateWpCode = await refusalPgCode(withTenant(app, PROBE.tenantId, (tx) => tx.execute(sql `UPDATE baseline_wp SET is_catch_all = true WHERE baseline_version_seq = ${seq}`)));
        expect(updateWpCode, 'UPDATE baseline_wp must be refused').toMatch(/^(42501|MOMO1)$/);
        const deleteWpCode = await refusalPgCode(withTenant(app, PROBE.tenantId, (tx) => tx.execute(sql `DELETE FROM baseline_wp WHERE baseline_version_seq = ${seq}`)));
        expect(deleteWpCode, 'DELETE baseline_wp must be refused').toMatch(/^(42501|MOMO1)$/);
        const deleteVersionCode = await refusalPgCode(withTenant(app, PROBE.tenantId, (tx) => tx.execute(sql `DELETE FROM baseline_version WHERE seq = ${seq}`)));
        expect(deleteVersionCode, 'DELETE baseline_version must be refused').toMatch(/^(42501|MOMO1)$/);
        // Prefer grant refusal (42501); trigger (MOMO1) is also acceptable if grant were present.
        void APPEND_ONLY_ERRCODE;
    });
    it('answers not_found for a viewer with no project reach', async () => {
        const owner = getDb(OWNER_DATABASE_URL);
        const leaf = await prepareSchedulableLeaf(owner, PROBE);
        await makeAllLeavesSchedulable(owner, PROBE);
        await scheduleLeaf(deps(), ctx(), PROBE.projectId, leaf.id);
        const viewer = pmCtx(PROBE, {
            userId: 'user-s41-viewer',
            roles: ['client_viewer'],
            projectIds: [],
        });
        const result = await setBaseline(deps(), viewer, { projectId: PROBE.projectId });
        expect(result.ok).toBe(false);
        if (result.ok)
            return;
        expect(result.error.code).toBe('not_found');
        const versions = await withTenant(getDb(APP_DATABASE_URL), PROBE.tenantId, async (tx) => tx
            .select()
            .from(s.baselineVersion)
            .where(and(eq(s.baselineVersion.tenantId, PROBE.tenantId), eq(s.baselineVersion.projectId, PROBE.projectId))));
        expect(versions).toHaveLength(0);
    });
});
