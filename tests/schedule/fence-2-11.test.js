/**
 * Story 2.11 fence cases: Project start (set/clear), Project finish, standalone Data Date,
 * audit before/after, AR-52 still green via schedule-closure.
 */
import { describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { applyPlanChange } from '../../packages/app/src/schedule/apply-plan-change';
import { dataDateAdvancePreview } from '../../packages/app/src/schedule/plan-edit';
import { getDb } from '../../packages/db/src/client';
import { assertProbeTenantsDisjoint, buildProbeTenant, createProbeTenant, } from '../../packages/db/src/probe-tenants';
import * as s from '../../packages/db/src/schema';
import { inTenantTransaction } from '../../packages/db/src/tenant-transaction';
import { withTenant } from '../../packages/db/src/with-tenant';
import { connectFenceHarness, installFenceAfterAll, pmCtx, prepareSchedulableLeaf, } from './fence-harness';
const OWNER_DATABASE_URL = process.env.DATABASE_URL;
const APP_DATABASE_URL = process.env.APP_DATABASE_URL;
const { reachable } = await connectFenceHarness({
    ownerUrl: OWNER_DATABASE_URL,
    appUrl: APP_DATABASE_URL,
    requireDb: process.env.REQUIRE_DB === '1',
});
const PROBE = buildProbeTenant('xtprobe-s211', 951_000_000);
assertProbeTenantsDisjoint([PROBE]);
await installFenceAfterAll({ reachable, ownerUrl: OWNER_DATABASE_URL, probe: PROBE });
const ctx = () => pmCtx(PROBE, { userId: 'user-s211' });
async function prepareBareProject(owner) {
    await createProbeTenant(owner, PROBE);
    const leaf = PROBE.state.wps.find((w) => w.isLeaf && !w.isMilestone);
    if (!leaf)
        throw new Error('fixture needs a leaf WP');
    await withTenant(owner, PROBE.tenantId, async (tx) => {
        await tx
            .update(s.project)
            .set({ projectStart: null, dataDate: null, projectFinish: null })
            .where(eq(s.project.id, PROBE.projectId));
        await tx
            .update(s.workPackage)
            .set({ durationDays: 3, constraintType: 'asap', constraintDate: null })
            .where(and(eq(s.workPackage.tenantId, PROBE.tenantId), eq(s.workPackage.projectId, PROBE.projectId), eq(s.workPackage.id, leaf.id)));
    });
    return leaf;
}
const prepareSchedulable = (owner) => prepareSchedulableLeaf(owner, PROBE);
describe('dataDateAdvancePreview', () => {
    it('names the remaining count', () => {
        expect(dataDateAdvancePreview('2026-09-26', 78)).toBe('Advancing to 26 Sep re-dates 78 remaining work packages');
    });
});
describe.skipIf(!reachable)('applyPlanChange fence (story 2.11)', () => {
    it('sets Project start with explicit Data Date and cause project_dates', async () => {
        const owner = getDb(OWNER_DATABASE_URL);
        const app = getDb(APP_DATABASE_URL);
        await prepareBareProject(owner);
        const result = await applyPlanChange({ handle: app, transaction: inTenantTransaction }, ctx(), {
            kind: 'set_project_start',
            projectId: PROBE.projectId,
            projectStart: '2026-09-01',
            dataDate: '2026-09-24',
        });
        expect(result.ok).toBe(true);
        if (!result.ok)
            return;
        const [project] = await withTenant(app, PROBE.tenantId, async (tx) => tx
            .select({
            projectStart: s.project.projectStart,
            dataDate: s.project.dataDate,
        })
            .from(s.project)
            .where(eq(s.project.id, PROBE.projectId)));
        expect(project?.projectStart).toBe('2026-09-01');
        expect(project?.dataDate).toBe('2026-09-24');
        const runs = await withTenant(app, PROBE.tenantId, async (tx) => tx
            .select({ cause: s.scheduleRun.cause })
            .from(s.scheduleRun)
            .where(eq(s.scheduleRun.projectId, PROBE.projectId)));
        expect(runs.some((r) => r.cause === 'project_dates')).toBe(true);
        const audits = await withTenant(app, PROBE.tenantId, async (tx) => tx
            .select({ payload: s.auditLog.payload })
            .from(s.auditLog)
            .where(and(eq(s.auditLog.tenantId, PROBE.tenantId), eq(s.auditLog.action, 'schedule.apply_plan_change'))));
        const last = audits.at(-1)?.payload;
        expect(last?.before?.projectStart).toBeNull();
        expect(last?.after?.projectStart).toBe('2026-09-01');
        expect(last?.after?.dataDate).toBe('2026-09-24');
    });
    it('omitted dataDate defaults via project tz, not UTC slice', async () => {
        const owner = getDb(OWNER_DATABASE_URL);
        const app = getDb(APP_DATABASE_URL);
        await prepareBareProject(owner);
        // 15:00 UTC + 540 min = 00:00 next calendar day in project tz → 2026-09-25
        const demoAnchor = new Date('2026-09-24T15:00:00.000Z');
        await withTenant(owner, PROBE.tenantId, async (tx) => {
            await tx
                .update(s.project)
                .set({ demoAnchor, tzOffsetMinutes: 540 })
                .where(eq(s.project.id, PROBE.projectId));
        });
        const result = await applyPlanChange({ handle: app, transaction: inTenantTransaction }, ctx(), {
            kind: 'set_project_start',
            projectId: PROBE.projectId,
            projectStart: '2026-09-01',
        });
        expect(result.ok).toBe(true);
        if (!result.ok)
            return;
        const [project] = await withTenant(app, PROBE.tenantId, async (tx) => tx
            .select({ dataDate: s.project.dataDate })
            .from(s.project)
            .where(eq(s.project.id, PROBE.projectId)));
        expect(project?.dataDate).toBe('2026-09-25');
        expect(project?.dataDate).not.toBe('2026-09-24');
    });
    it('re-set Project start does not clobber an advanced Data Date', async () => {
        const owner = getDb(OWNER_DATABASE_URL);
        const app = getDb(APP_DATABASE_URL);
        await prepareSchedulable(owner);
        const advanced = await applyPlanChange({ handle: app, transaction: inTenantTransaction }, ctx(), {
            kind: 'patch_data_date',
            projectId: PROBE.projectId,
            dataDate: '2026-10-15',
        });
        expect(advanced.ok).toBe(true);
        const reset = await applyPlanChange({ handle: app, transaction: inTenantTransaction }, ctx(), {
            kind: 'set_project_start',
            projectId: PROBE.projectId,
            projectStart: '2026-09-15',
        });
        expect(reset.ok).toBe(true);
        if (!reset.ok)
            return;
        const [project] = await withTenant(app, PROBE.tenantId, async (tx) => tx
            .select({ projectStart: s.project.projectStart, dataDate: s.project.dataDate })
            .from(s.project)
            .where(eq(s.project.id, PROBE.projectId)));
        expect(project?.projectStart).toBe('2026-09-15');
        expect(project?.dataDate).toBe('2026-10-15');
    });
    it('clears Project start without a schedule_run, audits runSeq null, leaves finish/dataDate', async () => {
        const owner = getDb(OWNER_DATABASE_URL);
        const app = getDb(APP_DATABASE_URL);
        await prepareSchedulable(owner);
        await withTenant(owner, PROBE.tenantId, async (tx) => {
            await tx
                .update(s.project)
                .set({ projectFinish: '2026-12-01' })
                .where(eq(s.project.id, PROBE.projectId));
        });
        const beforeRuns = await withTenant(app, PROBE.tenantId, async (tx) => tx
            .select({ seq: s.scheduleRun.seq })
            .from(s.scheduleRun)
            .where(eq(s.scheduleRun.projectId, PROBE.projectId)));
        const cleared = await applyPlanChange({ handle: app, transaction: inTenantTransaction }, ctx(), { kind: 'clear_project_start', projectId: PROBE.projectId });
        expect(cleared.ok).toBe(true);
        if (!cleared.ok)
            return;
        expect(cleared.value.kind).toBe('cleared');
        expect(cleared.value.seq).toBeNull();
        const [project] = await withTenant(app, PROBE.tenantId, async (tx) => tx
            .select({
            projectStart: s.project.projectStart,
            dataDate: s.project.dataDate,
            projectFinish: s.project.projectFinish,
        })
            .from(s.project)
            .where(eq(s.project.id, PROBE.projectId)));
        expect(project?.projectStart).toBeNull();
        expect(project?.dataDate).toBe('2026-10-05');
        expect(project?.projectFinish).toBe('2026-12-01');
        const afterRuns = await withTenant(app, PROBE.tenantId, async (tx) => tx
            .select({ seq: s.scheduleRun.seq })
            .from(s.scheduleRun)
            .where(eq(s.scheduleRun.projectId, PROBE.projectId)));
        expect(afterRuns.length).toBe(beforeRuns.length);
        const audits = await withTenant(app, PROBE.tenantId, async (tx) => tx
            .select({ payload: s.auditLog.payload })
            .from(s.auditLog)
            .where(and(eq(s.auditLog.tenantId, PROBE.tenantId), eq(s.auditLog.action, 'schedule.apply_plan_change'))));
        const last = audits.at(-1)?.payload;
        expect(last?.kind).toBe('clear_project_start');
        expect(last?.runSeq).toBeNull();
        expect(last?.before?.projectStart).toBe('2026-09-01');
        expect(last?.after?.projectStart).toBeNull();
    });
    it('set/clear Project finish writes the column and leaves early dates unchanged', async () => {
        const owner = getDb(OWNER_DATABASE_URL);
        const app = getDb(APP_DATABASE_URL);
        const leaf = await prepareSchedulable(owner);
        const seeded = await applyPlanChange({ handle: app, transaction: inTenantTransaction }, ctx(), {
            kind: 'patch_duration',
            projectId: PROBE.projectId,
            wpId: leaf.id,
            durationDays: 3,
        });
        expect(seeded.ok).toBe(true);
        if (!seeded.ok)
            return;
        const earlyBefore = await withTenant(app, PROBE.tenantId, async (tx) => tx
            .select({ earlyStart: s.wpSchedule.earlyStart, earlyFinish: s.wpSchedule.earlyFinish })
            .from(s.wpSchedule)
            .where(and(eq(s.wpSchedule.projectId, PROBE.projectId), eq(s.wpSchedule.wpId, leaf.id))));
        const setFinish = await applyPlanChange({ handle: app, transaction: inTenantTransaction }, ctx(), {
            kind: 'patch_project_finish',
            projectId: PROBE.projectId,
            projectFinish: '2026-12-31',
        });
        expect(setFinish.ok).toBe(true);
        if (!setFinish.ok)
            return;
        const [afterSet] = await withTenant(app, PROBE.tenantId, async (tx) => tx
            .select({ projectFinish: s.project.projectFinish })
            .from(s.project)
            .where(eq(s.project.id, PROBE.projectId)));
        expect(afterSet?.projectFinish).toBe('2026-12-31');
        const earlyAfterSet = await withTenant(app, PROBE.tenantId, async (tx) => tx
            .select({ earlyStart: s.wpSchedule.earlyStart, earlyFinish: s.wpSchedule.earlyFinish })
            .from(s.wpSchedule)
            .where(and(eq(s.wpSchedule.projectId, PROBE.projectId), eq(s.wpSchedule.wpId, leaf.id))));
        expect(earlyAfterSet[0]?.earlyStart).toBe(earlyBefore[0]?.earlyStart);
        expect(earlyAfterSet[0]?.earlyFinish).toBe(earlyBefore[0]?.earlyFinish);
        const clearFinish = await applyPlanChange({ handle: app, transaction: inTenantTransaction }, ctx(), {
            kind: 'patch_project_finish',
            projectId: PROBE.projectId,
            projectFinish: null,
        });
        expect(clearFinish.ok).toBe(true);
        if (!clearFinish.ok)
            return;
        const [afterClear] = await withTenant(app, PROBE.tenantId, async (tx) => tx
            .select({ projectFinish: s.project.projectFinish })
            .from(s.project)
            .where(eq(s.project.id, PROBE.projectId)));
        expect(afterClear?.projectFinish).toBeNull();
        const runs = await withTenant(app, PROBE.tenantId, async (tx) => tx
            .select({ cause: s.scheduleRun.cause })
            .from(s.scheduleRun)
            .where(eq(s.scheduleRun.projectId, PROBE.projectId)));
        expect(runs.filter((r) => r.cause === 'project_dates').length).toBeGreaterThanOrEqual(2);
    });
    it('refuses Data Date earlier than latest actual finish with blockers', async () => {
        const owner = getDb(OWNER_DATABASE_URL);
        const app = getDb(APP_DATABASE_URL);
        const leaf = await prepareSchedulable(owner);
        const actuals = await applyPlanChange({ handle: app, transaction: inTenantTransaction }, ctx(), {
            kind: 'patch_actual_dates',
            projectId: PROBE.projectId,
            wpId: leaf.id,
            actualStart: '2026-09-10',
            actualFinish: '2026-10-20',
            source: 'typed',
            advanceDataDate: '2026-10-20',
        });
        expect(actuals.ok).toBe(true);
        if (!actuals.ok)
            return;
        const early = await applyPlanChange({ handle: app, transaction: inTenantTransaction }, ctx(), {
            kind: 'patch_data_date',
            projectId: PROBE.projectId,
            dataDate: '2026-10-01',
        });
        expect(early.ok).toBe(false);
        if (early.ok)
            return;
        expect(early.error.details?.dataDate).toContain('before_latest_actual_finish');
        expect(early.error.details?.blockingWpIds).toContain(leaf.id);
    });
    it('set_project_start refuses an early Data Date write with the same blockers', async () => {
        const owner = getDb(OWNER_DATABASE_URL);
        const app = getDb(APP_DATABASE_URL);
        const leaf = await prepareSchedulable(owner);
        const actuals = await applyPlanChange({ handle: app, transaction: inTenantTransaction }, ctx(), {
            kind: 'patch_actual_dates',
            projectId: PROBE.projectId,
            wpId: leaf.id,
            actualStart: '2026-09-10',
            actualFinish: '2026-10-20',
            source: 'typed',
            advanceDataDate: '2026-10-20',
        });
        expect(actuals.ok).toBe(true);
        if (!actuals.ok)
            return;
        const early = await applyPlanChange({ handle: app, transaction: inTenantTransaction }, ctx(), {
            kind: 'set_project_start',
            projectId: PROBE.projectId,
            projectStart: '2026-09-15',
            dataDate: '2026-10-01',
        });
        expect(early.ok).toBe(false);
        if (early.ok)
            return;
        expect(early.error.details?.dataDate).toContain('before_latest_actual_finish');
        expect(early.error.details?.blockingWpIds).toContain(leaf.id);
    });
    it('refuses patch_data_date and patch_project_finish when Project start is null', async () => {
        const owner = getDb(OWNER_DATABASE_URL);
        const app = getDb(APP_DATABASE_URL);
        await prepareBareProject(owner);
        const dataDate = await applyPlanChange({ handle: app, transaction: inTenantTransaction }, ctx(), {
            kind: 'patch_data_date',
            projectId: PROBE.projectId,
            dataDate: '2026-10-01',
        });
        expect(dataDate.ok).toBe(false);
        if (dataDate.ok)
            return;
        expect(dataDate.error.details?.projectStart).toContain('required');
        const finish = await applyPlanChange({ handle: app, transaction: inTenantTransaction }, ctx(), {
            kind: 'patch_project_finish',
            projectId: PROBE.projectId,
            projectFinish: '2026-12-31',
        });
        expect(finish.ok).toBe(false);
        if (finish.ok)
            return;
        expect(finish.error.details?.projectStart).toContain('required');
    });
    it('refuses resolve when projectStart is set but dataDate is null', async () => {
        const owner = getDb(OWNER_DATABASE_URL);
        const app = getDb(APP_DATABASE_URL);
        const leaf = await prepareBareProject(owner);
        await withTenant(owner, PROBE.tenantId, async (tx) => {
            await tx
                .update(s.project)
                .set({ projectStart: '2026-09-01', dataDate: null })
                .where(eq(s.project.id, PROBE.projectId));
        });
        const result = await applyPlanChange({ handle: app, transaction: inTenantTransaction }, ctx(), {
            kind: 'patch_duration',
            projectId: PROBE.projectId,
            wpId: leaf.id,
            durationDays: 4,
        });
        expect(result.ok).toBe(false);
        if (result.ok)
            return;
        expect(result.error.details?.dataDate).toContain('required');
    });
    it('remainingLeafCount excludes finished leaves', async () => {
        const owner = getDb(OWNER_DATABASE_URL);
        const app = getDb(APP_DATABASE_URL);
        const leaf = await prepareSchedulable(owner);
        const other = PROBE.state.wps.find((w) => w.isLeaf && !w.isMilestone && w.id !== leaf.id);
        if (!other)
            throw new Error('need two leaves');
        await withTenant(owner, PROBE.tenantId, async (tx) => {
            await tx
                .update(s.workPackage)
                .set({ durationDays: 2 })
                .where(and(eq(s.workPackage.projectId, PROBE.projectId), eq(s.workPackage.id, other.id)));
        });
        const { planInputRepositoryOn } = await import('../../packages/db/src/repositories/plan-input');
        const before = await withTenant(app, PROBE.tenantId, async (tx) => planInputRepositoryOn({ tx, tenantId: PROBE.tenantId }).remainingLeafCount(PROBE.projectId));
        await applyPlanChange({ handle: app, transaction: inTenantTransaction }, ctx(), {
            kind: 'patch_actual_dates',
            projectId: PROBE.projectId,
            wpId: leaf.id,
            actualStart: '2026-09-10',
            actualFinish: '2026-10-05',
            source: 'typed',
        });
        const after = await withTenant(app, PROBE.tenantId, async (tx) => planInputRepositoryOn({ tx, tenantId: PROBE.tenantId }).remainingLeafCount(PROBE.projectId));
        expect(after).toBe(before - 1);
    });
    it('advances Data Date standalone with cause data_date', async () => {
        const owner = getDb(OWNER_DATABASE_URL);
        const app = getDb(APP_DATABASE_URL);
        await prepareSchedulable(owner);
        const advanced = await applyPlanChange({ handle: app, transaction: inTenantTransaction }, ctx(), {
            kind: 'patch_data_date',
            projectId: PROBE.projectId,
            dataDate: '2026-10-15',
        });
        expect(advanced.ok).toBe(true);
        if (!advanced.ok)
            return;
        const [project] = await withTenant(app, PROBE.tenantId, async (tx) => tx
            .select({ dataDate: s.project.dataDate })
            .from(s.project)
            .where(eq(s.project.id, PROBE.projectId)));
        expect(project?.dataDate).toBe('2026-10-15');
        const runs = await withTenant(app, PROBE.tenantId, async (tx) => tx
            .select({ cause: s.scheduleRun.cause })
            .from(s.scheduleRun)
            .where(eq(s.scheduleRun.projectId, PROBE.projectId)));
        expect(runs.some((r) => r.cause === 'data_date')).toBe(true);
    });
});
