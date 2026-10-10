/**
 * Story 2.10 fence cases: WP create/delete/re-parent, actuals, recorded %, leaf→summary,
 * compound Data Date, 100-CF write-path probe.
 */
import { describe, expect, it } from 'vitest';
import { and, eq, or } from 'drizzle-orm';
import { applyPlanChange } from '../../packages/app/src/schedule/apply-plan-change';
import { completeWorkPackage, getFirstObservedActivity, getWpDeleteConfirm, refuseDerivedDateEdit, DERIVED_DATE_TEACHING, } from '../../packages/app/src/schedule/plan-edit';
import { getDb } from '../../packages/db/src/client';
import { assertProbeTenantsDisjoint, buildProbeTenant, } from '../../packages/db/src/probe-tenants';
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
const PROBE = buildProbeTenant('xtprobe-s210', 950_000_000);
assertProbeTenantsDisjoint([PROBE]);
await installFenceAfterAll({ reachable, ownerUrl: OWNER_DATABASE_URL, probe: PROBE });
const ctx = () => pmCtx(PROBE, { userId: 'user-s210' });
const prepareSchedulableProject = (owner) => prepareSchedulableLeaf(owner, PROBE);
/** Clear derived heads for a WP so leaf→summary create_wp is not refused as mapped_leaf. */
async function clearMappingsOnWp(owner, wpId) {
    await withTenant(owner, PROBE.tenantId, async (tx) => {
        await tx
            .delete(s.mappingHead)
            .where(and(eq(s.mappingHead.tenantId, PROBE.tenantId), eq(s.mappingHead.projectId, PROBE.projectId), eq(s.mappingHead.wpId, wpId)));
    });
}
describe.skipIf(!reachable)('applyPlanChange fence (story 2.10)', () => {
    it('creates a leaf WP and appends schedule_run with cause wp_created', async () => {
        const owner = getDb(OWNER_DATABASE_URL);
        const app = getDb(APP_DATABASE_URL);
        await prepareSchedulableProject(owner);
        const result = await applyPlanChange({ handle: app, transaction: inTenantTransaction }, ctx(), {
            kind: 'create_wp',
            projectId: PROBE.projectId,
            wpId: `${PROBE.tenantId}-wp-new`,
            parentId: null,
            wbsCode: '99.1',
            name: 'New leaf',
            durationDays: 2,
        });
        expect(result.ok).toBe(true);
        if (!result.ok)
            return;
        const runs = await withTenant(app, PROBE.tenantId, async (tx) => tx
            .select({ cause: s.scheduleRun.cause })
            .from(s.scheduleRun)
            .where(and(eq(s.scheduleRun.tenantId, PROBE.tenantId), eq(s.scheduleRun.projectId, PROBE.projectId))));
        expect(runs.some((r) => r.cause === 'wp_created')).toBe(true);
    });
    it('soft-deletes a WP with edges and does not relink', async () => {
        const owner = getDb(OWNER_DATABASE_URL);
        const app = getDb(APP_DATABASE_URL);
        const leafA = await prepareSchedulableProject(owner);
        const leafB = PROBE.state.wps.find((w) => w.isLeaf && !w.isMilestone && w.id !== leafA.id);
        if (!leafB)
            throw new Error('need two leaves');
        await withTenant(owner, PROBE.tenantId, async (tx) => {
            await tx
                .update(s.workPackage)
                .set({ durationDays: 2 })
                .where(and(eq(s.workPackage.projectId, PROBE.projectId), eq(s.workPackage.id, leafB.id)));
            await tx.insert(s.wpDependency).values({
                tenantId: PROBE.tenantId,
                projectId: PROBE.projectId,
                predecessorWpId: leafA.id,
                successorWpId: leafB.id,
                type: 'FS',
                lagDays: 0,
                predIsLeaf: true,
                succIsLeaf: true,
            });
        });
        const deleted = await applyPlanChange({ handle: app, transaction: inTenantTransaction }, ctx(), { kind: 'delete_wp', projectId: PROBE.projectId, wpId: leafA.id });
        expect(deleted.ok).toBe(true);
        if (!deleted.ok)
            return;
        const edges = await withTenant(app, PROBE.tenantId, async (tx) => tx
            .select()
            .from(s.wpDependency)
            .where(and(eq(s.wpDependency.tenantId, PROBE.tenantId), eq(s.wpDependency.projectId, PROBE.projectId))));
        expect(edges).toHaveLength(0);
        const [wp] = await withTenant(app, PROBE.tenantId, async (tx) => tx
            .select({ deletedAt: s.workPackage.deletedAt })
            .from(s.workPackage)
            .where(eq(s.workPackage.id, leafA.id)));
        expect(wp?.deletedAt).not.toBeNull();
        const runs = await withTenant(app, PROBE.tenantId, async (tx) => tx
            .select({ cause: s.scheduleRun.cause })
            .from(s.scheduleRun)
            .where(eq(s.scheduleRun.projectId, PROBE.projectId)));
        expect(runs.some((r) => r.cause === 'wp_deleted')).toBe(true);
    });
    it('refuses actual finish before start', async () => {
        const owner = getDb(OWNER_DATABASE_URL);
        const app = getDb(APP_DATABASE_URL);
        const leaf = await prepareSchedulableProject(owner);
        const result = await applyPlanChange({ handle: app, transaction: inTenantTransaction }, ctx(), {
            kind: 'patch_actual_dates',
            projectId: PROBE.projectId,
            wpId: leaf.id,
            actualStart: '2026-10-10',
            actualFinish: '2026-10-01',
            source: 'typed',
        });
        expect(result.ok).toBe(false);
        if (result.ok)
            return;
        expect(result.error.code).toBe('invalid_input');
    });
    // I/O matrix: Actuals happy — typed actuals on/before Data Date; cause actual_dates.
    it('writes typed actuals on or before Data Date without advancing it', async () => {
        const owner = getDb(OWNER_DATABASE_URL);
        const app = getDb(APP_DATABASE_URL);
        const leaf = await prepareSchedulableProject(owner);
        const result = await applyPlanChange({ handle: app, transaction: inTenantTransaction }, ctx(), {
            kind: 'patch_actual_dates',
            projectId: PROBE.projectId,
            wpId: leaf.id,
            actualStart: '2026-09-29',
            actualFinish: '2026-10-03',
            source: 'typed',
        });
        expect(result.ok).toBe(true);
        if (!result.ok)
            return;
        const [project] = await withTenant(app, PROBE.tenantId, async (tx) => tx
            .select({ dataDate: s.project.dataDate })
            .from(s.project)
            .where(eq(s.project.id, PROBE.projectId)));
        expect(project?.dataDate).toBe('2026-10-05');
        const status = await withTenant(app, PROBE.tenantId, async (tx) => tx
            .select({
            actualStart: s.wpStatusEvent.actualStart,
            actualFinish: s.wpStatusEvent.actualFinish,
            source: s.wpStatusEvent.source,
        })
            .from(s.wpStatusEvent)
            .where(and(eq(s.wpStatusEvent.projectId, PROBE.projectId), eq(s.wpStatusEvent.wpId, leaf.id)))
            .orderBy(s.wpStatusEvent.seq));
        const head = status[status.length - 1];
        expect(head.actualStart).toBe('2026-09-29');
        expect(head.actualFinish).toBe('2026-10-03');
        expect(head.source).toBe('typed');
        const runs = await withTenant(app, PROBE.tenantId, async (tx) => tx
            .select({ cause: s.scheduleRun.cause })
            .from(s.scheduleRun)
            .where(eq(s.scheduleRun.projectId, PROBE.projectId)));
        expect(runs.some((r) => r.cause === 'actual_dates')).toBe(true);
    });
    // I/O matrix: First-observed fill — evidence shown; write only on accept with accepted-from-proposal.
    it('shows first-observed evidence and writes only on accept with accepted-from-proposal', async () => {
        const owner = getDb(OWNER_DATABASE_URL);
        const app = getDb(APP_DATABASE_URL);
        await prepareSchedulableProject(owner);
        // Pick a leaf that the fixture maps Tickets onto (relabelled ids).
        const mappedWpId = PROBE.state.mappingEvents.find((m) => m.wpId !== null)?.wpId;
        if (mappedWpId === null || mappedWpId === undefined) {
            throw new Error('fixture needs a mapped WP');
        }
        const leaf = PROBE.state.wps.find((w) => w.id === mappedWpId && w.isLeaf);
        if (!leaf)
            throw new Error('mapped WP must be a leaf');
        await withTenant(owner, PROBE.tenantId, async (tx) => {
            await tx
                .update(s.workPackage)
                .set({ durationDays: 3, constraintType: 'asap', constraintDate: null })
                .where(and(eq(s.workPackage.projectId, PROBE.projectId), eq(s.workPackage.id, leaf.id)));
        });
        const deps = { handle: app, transaction: inTenantTransaction };
        const statusBefore = await withTenant(app, PROBE.tenantId, async (tx) => tx
            .select({ seq: s.wpStatusEvent.seq })
            .from(s.wpStatusEvent)
            .where(and(eq(s.wpStatusEvent.projectId, PROBE.projectId), eq(s.wpStatusEvent.wpId, leaf.id))));
        // Read path: evidence only — never auto-writes.
        const evidence = await getFirstObservedActivity(deps, ctx(), {
            projectId: PROBE.projectId,
            wpId: leaf.id,
        });
        expect(evidence.ok).toBe(true);
        if (!evidence.ok)
            return;
        expect(evidence.value.firstObserved).not.toBeNull();
        const firstObserved = evidence.value.firstObserved;
        const statusAfterRead = await withTenant(app, PROBE.tenantId, async (tx) => tx
            .select({ seq: s.wpStatusEvent.seq })
            .from(s.wpStatusEvent)
            .where(and(eq(s.wpStatusEvent.projectId, PROBE.projectId), eq(s.wpStatusEvent.wpId, leaf.id))));
        expect(statusAfterRead).toHaveLength(statusBefore.length);
        // Accept through the complete-flow helper — only then is source accepted-from-proposal.
        const finish = firstObserved <= '2026-10-05' ? '2026-10-05' : firstObserved;
        const accepted = await completeWorkPackage(deps, ctx(), {
            projectId: PROBE.projectId,
            wpId: leaf.id,
            actualStart: firstObserved,
            actualFinish: finish,
            source: 'accepted-from-proposal',
            ...(finish > '2026-10-05' ? { advanceDataDate: finish } : {}),
        });
        expect(accepted.ok).toBe(true);
        if (!accepted.ok)
            return;
        const status = await withTenant(app, PROBE.tenantId, async (tx) => tx
            .select({
            actualStart: s.wpStatusEvent.actualStart,
            source: s.wpStatusEvent.source,
        })
            .from(s.wpStatusEvent)
            .where(and(eq(s.wpStatusEvent.projectId, PROBE.projectId), eq(s.wpStatusEvent.wpId, leaf.id)))
            .orderBy(s.wpStatusEvent.seq));
        expect(status.length).toBe(statusBefore.length + 1);
        const head = status[status.length - 1];
        expect(head.actualStart).toBe(firstObserved);
        expect(head.source).toBe('accepted-from-proposal');
    });
    // I/O matrix: CF value write — definition exists; set value through the fence.
    it('persists a custom field value through the fence after a definition exists', async () => {
        const owner = getDb(OWNER_DATABASE_URL);
        const app = getDb(APP_DATABASE_URL);
        const leaf = await prepareSchedulableProject(owner);
        const definitionId = `${PROBE.tenantId}-cf-value-def`;
        const defined = await applyPlanChange({ handle: app, transaction: inTenantTransaction }, ctx(), {
            kind: 'create_custom_field_definition',
            projectId: PROBE.projectId,
            definitionId,
            name: 'Risk note',
            fieldType: 'text',
        });
        expect(defined.ok).toBe(true);
        const valued = await applyPlanChange({ handle: app, transaction: inTenantTransaction }, ctx(), {
            kind: 'set_custom_field_value',
            projectId: PROBE.projectId,
            wpId: leaf.id,
            definitionId,
            textValue: 'high',
        });
        expect(valued.ok).toBe(true);
        if (!valued.ok)
            return;
        const [row] = await withTenant(app, PROBE.tenantId, async (tx) => tx
            .select({
            textValue: s.customFieldValue.textValue,
            definitionId: s.customFieldValue.definitionId,
            wpId: s.customFieldValue.wpId,
        })
            .from(s.customFieldValue)
            .where(and(eq(s.customFieldValue.projectId, PROBE.projectId), eq(s.customFieldValue.definitionId, definitionId), eq(s.customFieldValue.wpId, leaf.id))));
        expect(row?.textValue).toBe('high');
    });
    it('compound advances data_date with actual finish when confirmed', async () => {
        const owner = getDb(OWNER_DATABASE_URL);
        const app = getDb(APP_DATABASE_URL);
        const leaf = await prepareSchedulableProject(owner);
        const declined = await applyPlanChange({ handle: app, transaction: inTenantTransaction }, ctx(), {
            kind: 'patch_actual_dates',
            projectId: PROBE.projectId,
            wpId: leaf.id,
            actualStart: '2026-10-01',
            actualFinish: '2026-10-20',
            source: 'typed',
        });
        expect(declined.ok).toBe(false);
        const afterDecline = await withTenant(app, PROBE.tenantId, async (tx) => {
            const [project] = await tx
                .select({ dataDate: s.project.dataDate })
                .from(s.project)
                .where(eq(s.project.id, PROBE.projectId));
            const status = await tx
                .select({ seq: s.wpStatusEvent.seq })
                .from(s.wpStatusEvent)
                .where(and(eq(s.wpStatusEvent.projectId, PROBE.projectId), eq(s.wpStatusEvent.wpId, leaf.id)));
            return { dataDate: project?.dataDate, statusCount: status.length };
        });
        expect(afterDecline.dataDate).toBe('2026-10-05');
        expect(afterDecline.statusCount).toBe(0);
        const accepted = await applyPlanChange({ handle: app, transaction: inTenantTransaction }, ctx(), {
            kind: 'patch_actual_dates',
            projectId: PROBE.projectId,
            wpId: leaf.id,
            actualStart: '2026-10-01',
            actualFinish: '2026-10-20',
            source: 'typed',
            advanceDataDate: '2026-10-20',
        });
        expect(accepted.ok).toBe(true);
        if (!accepted.ok)
            return;
        const [project] = await withTenant(app, PROBE.tenantId, async (tx) => tx.select({ dataDate: s.project.dataDate }).from(s.project).where(eq(s.project.id, PROBE.projectId)));
        expect(project?.dataDate).toBe('2026-10-20');
        const status = await withTenant(app, PROBE.tenantId, async (tx) => tx
            .select()
            .from(s.wpStatusEvent)
            .where(and(eq(s.wpStatusEvent.projectId, PROBE.projectId), eq(s.wpStatusEvent.wpId, leaf.id))));
        expect(status.length).toBeGreaterThan(0);
        expect(status[status.length - 1].actualFinish).toBe('2026-10-20');
        const runs = await withTenant(app, PROBE.tenantId, async (tx) => tx
            .select({ cause: s.scheduleRun.cause })
            .from(s.scheduleRun)
            .where(eq(s.scheduleRun.projectId, PROBE.projectId)));
        expect(runs.some((r) => r.cause === 'data_date')).toBe(true);
    });
    it('writes recorded pct via pct_override_event and resolves watermark', async () => {
        const owner = getDb(OWNER_DATABASE_URL);
        const app = getDb(APP_DATABASE_URL);
        const leaf = await prepareSchedulableProject(owner);
        const result = await applyPlanChange({ handle: app, transaction: inTenantTransaction }, ctx(), {
            kind: 'patch_recorded_pct',
            projectId: PROBE.projectId,
            wpId: leaf.id,
            recordedPctNum: 25n,
            recordedPctDen: 100n,
        });
        expect(result.ok).toBe(true);
        if (!result.ok)
            return;
        const events = await withTenant(app, PROBE.tenantId, async (tx) => tx
            .select()
            .from(s.pctOverrideEvent)
            .where(eq(s.pctOverrideEvent.projectId, PROBE.projectId)));
        expect(events).toHaveLength(1);
        expect(events[0].recordedPctNum).toBe(25n);
        const runs = await withTenant(app, PROBE.tenantId, async (tx) => tx
            .select({ cause: s.scheduleRun.cause, inputs: s.scheduleRun.inputs })
            .from(s.scheduleRun)
            .where(eq(s.scheduleRun.projectId, PROBE.projectId))
            .orderBy(s.scheduleRun.seq));
        expect(runs.some((r) => r.cause === 'progress')).toBe(true);
        const latest = runs[runs.length - 1];
        const raw = latest.inputs;
        expect((raw.watermarks?.pctOverrideSeqMax ?? 0) > 0).toBe(true);
        const storedWp = raw.wps?.find((w) => w.id === leaf.id);
        expect(storedWp?.recordedPct).toEqual({ den: '100', num: '25' });
    });
    it('leaf→summary clears leaf-only columns in the same action with drop resolution', async () => {
        const owner = getDb(OWNER_DATABASE_URL);
        const app = getDb(APP_DATABASE_URL);
        const leaf = await prepareSchedulableProject(owner);
        await clearMappingsOnWp(owner, leaf.id);
        const result = await applyPlanChange({ handle: app, transaction: inTenantTransaction }, ctx(), {
            kind: 'create_wp',
            projectId: PROBE.projectId,
            wpId: `${PROBE.tenantId}-child`,
            parentId: leaf.id,
            wbsCode: `${leaf.wbsCode}.1`,
            name: 'Child under former leaf',
            durationDays: 1,
            leafResolution: { strategy: 'drop' },
        });
        expect(result.ok).toBe(true);
        if (!result.ok)
            return;
        const [parent] = await withTenant(app, PROBE.tenantId, async (tx) => tx
            .select({
            childCount: s.workPackage.childCount,
            isLeaf: s.workPackage.isLeaf,
            durationDays: s.workPackage.durationDays,
            constraintType: s.workPackage.constraintType,
        })
            .from(s.workPackage)
            .where(eq(s.workPackage.id, leaf.id)));
        expect(parent?.isLeaf).toBe(false);
        expect(parent?.childCount).toBeGreaterThanOrEqual(1);
        expect(parent?.durationDays).toBeNull();
        expect(parent?.constraintType).toBe('asap');
    });
    it('leaf→summary moves leaf-only columns onto the child when resolved move_to_child', async () => {
        const owner = getDb(OWNER_DATABASE_URL);
        const app = getDb(APP_DATABASE_URL);
        const leaf = await prepareSchedulableProject(owner);
        await clearMappingsOnWp(owner, leaf.id);
        const childId = `${PROBE.tenantId}-moved-child`;
        const result = await applyPlanChange({ handle: app, transaction: inTenantTransaction }, ctx(), {
            kind: 'create_wp',
            projectId: PROBE.projectId,
            wpId: childId,
            parentId: leaf.id,
            wbsCode: `${leaf.wbsCode}.1`,
            name: 'Child receiving leaf inputs',
            leafResolution: { strategy: 'move_to_child', childWpId: childId },
        });
        expect(result.ok).toBe(true);
        if (!result.ok)
            return;
        const rows = await withTenant(app, PROBE.tenantId, async (tx) => tx
            .select({
            id: s.workPackage.id,
            isLeaf: s.workPackage.isLeaf,
            durationDays: s.workPackage.durationDays,
            constraintType: s.workPackage.constraintType,
        })
            .from(s.workPackage)
            .where(and(eq(s.workPackage.projectId, PROBE.projectId), or(eq(s.workPackage.id, leaf.id), eq(s.workPackage.id, childId)))));
        const parent = rows.find((r) => r.id === leaf.id);
        const child = rows.find((r) => r.id === childId);
        expect(parent?.isLeaf).toBe(false);
        expect(parent?.durationDays).toBeNull();
        expect(parent?.constraintType).toBe('asap');
        expect(child?.durationDays).toBe(3);
    });
    it('refuses leaf→summary without leafResolution when the parent still has leaf inputs', async () => {
        const owner = getDb(OWNER_DATABASE_URL);
        const app = getDb(APP_DATABASE_URL);
        const leaf = await prepareSchedulableProject(owner);
        await clearMappingsOnWp(owner, leaf.id);
        const result = await applyPlanChange({ handle: app, transaction: inTenantTransaction }, ctx(), {
            kind: 'create_wp',
            projectId: PROBE.projectId,
            wpId: `${PROBE.tenantId}-unresolved-child`,
            parentId: leaf.id,
            wbsCode: `${leaf.wbsCode}.1`,
            name: 'Child without resolution',
            durationDays: 1,
        });
        expect(result.ok).toBe(false);
        if (result.ok)
            return;
        expect(result.error.code).toBe('invalid_input');
        expect(result.error.details?.leafResolution).toEqual(['required']);
    });
    it('refuses create_wp under a mapped leaf until mappings are reassigned (story 5.9)', async () => {
        const owner = getDb(OWNER_DATABASE_URL);
        const app = getDb(APP_DATABASE_URL);
        const leaf = await prepareSchedulableProject(owner);
        const ticketId = PROBE.state.mappingEvents[0]?.ticketId;
        if (!ticketId)
            throw new Error('fixture needs a mapping event ticket');
        // Ensure the leaf is intentionally mapped (head SoT for the guard).
        await withTenant(owner, PROBE.tenantId, async (tx) => {
            await tx
                .insert(s.mappingHead)
                .values({
                tenantId: PROBE.tenantId,
                projectId: PROBE.projectId,
                ticketId,
                wpId: leaf.id,
                source: 'manual',
                ruleId: null,
                seq: 9_000_001,
                at: new Date('2026-09-01T00:00:00Z'),
                actor: 'user:s210-mapped-leaf',
            })
                .onConflictDoUpdate({
                target: [s.mappingHead.tenantId, s.mappingHead.projectId, s.mappingHead.ticketId],
                set: {
                    wpId: leaf.id,
                    source: 'manual',
                    ruleId: null,
                    seq: 9_000_001,
                    at: new Date('2026-09-01T00:00:00Z'),
                    actor: 'user:s210-mapped-leaf',
                },
            });
        });
        const childId = `${PROBE.tenantId}-mapped-leaf-child`;
        const result = await applyPlanChange({ handle: app, transaction: inTenantTransaction }, ctx(), {
            kind: 'create_wp',
            projectId: PROBE.projectId,
            wpId: childId,
            parentId: leaf.id,
            wbsCode: `${leaf.wbsCode}.9`,
            name: 'Child under mapped leaf',
            durationDays: 1,
            leafResolution: { strategy: 'drop' },
        });
        expect(result.ok).toBe(false);
        if (result.ok)
            return;
        expect(result.error.code).toBe('invalid_input');
        expect(result.error.details?.wpId).toEqual(['mapped_leaf']);
        const children = await withTenant(app, PROBE.tenantId, async (tx) => tx
            .select({ id: s.workPackage.id })
            .from(s.workPackage)
            .where(eq(s.workPackage.id, childId)));
        expect(children).toEqual([]);
    });
    it('lists edge endpoints for delete confirm before soft-delete', async () => {
        const owner = getDb(OWNER_DATABASE_URL);
        const app = getDb(APP_DATABASE_URL);
        const leafA = await prepareSchedulableProject(owner);
        const leafB = PROBE.state.wps.find((w) => w.isLeaf && !w.isMilestone && w.id !== leafA.id);
        if (!leafB)
            throw new Error('need two leaves');
        await withTenant(owner, PROBE.tenantId, async (tx) => {
            await tx
                .update(s.workPackage)
                .set({ durationDays: 2 })
                .where(and(eq(s.workPackage.projectId, PROBE.projectId), eq(s.workPackage.id, leafB.id)));
            await tx.insert(s.wpDependency).values({
                tenantId: PROBE.tenantId,
                projectId: PROBE.projectId,
                predecessorWpId: leafA.id,
                successorWpId: leafB.id,
                type: 'FS',
                lagDays: 0,
                predIsLeaf: true,
                succIsLeaf: true,
            });
        });
        const confirm = await getWpDeleteConfirm({ handle: app, transaction: inTenantTransaction }, ctx(), { projectId: PROBE.projectId, wpId: leafA.id });
        expect(confirm.ok).toBe(true);
        if (!confirm.ok)
            return;
        expect(confirm.value.edges).toEqual([
            { predecessorWpId: leafA.id, successorWpId: leafB.id },
        ]);
    });
    it('refuses soft-delete of a WP that still has children', async () => {
        const owner = getDb(OWNER_DATABASE_URL);
        const app = getDb(APP_DATABASE_URL);
        await prepareSchedulableProject(owner);
        const summary = PROBE.state.wps.find((w) => !w.isLeaf);
        if (!summary)
            throw new Error('need a summary with children');
        const result = await applyPlanChange({ handle: app, transaction: inTenantTransaction }, ctx(), { kind: 'delete_wp', projectId: PROBE.projectId, wpId: summary.id });
        expect(result.ok).toBe(false);
        if (result.ok)
            return;
        expect(result.error.code).toBe('invalid_input');
        expect(result.error.details?.wpId).toEqual(['has_children']);
    });
    it('100 CF definitions meet write-path probe; 101st is warned not blocked', async () => {
        const owner = getDb(OWNER_DATABASE_URL);
        const app = getDb(APP_DATABASE_URL);
        await prepareSchedulableProject(owner);
        for (let i = 0; i < 100; i++) {
            const r = await applyPlanChange({ handle: app, transaction: inTenantTransaction }, ctx(), {
                kind: 'create_custom_field_definition',
                projectId: PROBE.projectId,
                definitionId: `${PROBE.tenantId}-cf-${i}`,
                name: `Field ${i}`,
                fieldType: 'text',
            });
            expect(r.ok).toBe(true);
        }
        const warned = await applyPlanChange({ handle: app, transaction: inTenantTransaction }, ctx(), {
            kind: 'create_custom_field_definition',
            projectId: PROBE.projectId,
            definitionId: `${PROBE.tenantId}-cf-100`,
            name: 'Field 100',
            fieldType: 'text',
        });
        expect(warned.ok).toBe(true);
        if (!warned.ok)
            return;
        expect(warned.value.warnings).toContain('custom_field_definition_untested_bound');
    }, 120_000);
    it('reparents a WP under a new parent', async () => {
        const owner = getDb(OWNER_DATABASE_URL);
        const app = getDb(APP_DATABASE_URL);
        const leaf = await prepareSchedulableProject(owner);
        const summary = PROBE.state.wps.find((w) => !w.isLeaf);
        if (!summary)
            throw new Error('need a summary');
        // Create a free root leaf then move it under the summary.
        const created = await applyPlanChange({ handle: app, transaction: inTenantTransaction }, ctx(), {
            kind: 'create_wp',
            projectId: PROBE.projectId,
            wpId: `${PROBE.tenantId}-move-me`,
            parentId: null,
            wbsCode: '88.1',
            name: 'Movable',
            durationDays: 1,
        });
        expect(created.ok).toBe(true);
        const moved = await applyPlanChange({ handle: app, transaction: inTenantTransaction }, ctx(), {
            kind: 'reparent_wp',
            projectId: PROBE.projectId,
            wpId: `${PROBE.tenantId}-move-me`,
            newParentId: summary.id,
        });
        expect(moved.ok).toBe(true);
        if (!moved.ok)
            return;
        const [row] = await withTenant(app, PROBE.tenantId, async (tx) => tx
            .select({ parentId: s.workPackage.parentId })
            .from(s.workPackage)
            .where(eq(s.workPackage.id, `${PROBE.tenantId}-move-me`)));
        expect(row?.parentId).toBe(summary.id);
        void leaf;
    });
});
describe('derived-date teaching refuse (story 2.10)', () => {
    it('refuses without writing and carries teaching copy', () => {
        const result = refuseDerivedDateEdit();
        expect(result.ok).toBe(false);
        if (result.ok)
            return;
        expect(result.error.details?.message?.[0]).toBe(DERIVED_DATE_TEACHING);
    });
});
