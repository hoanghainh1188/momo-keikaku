/**
 * Story 2.10 fence cases: WP create/delete/re-parent, actuals, recorded %, leaf→summary,
 * compound Data Date, 100-CF write-path probe.
 */
import { afterAll, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { applyPlanChange } from '../../packages/app/src/schedule/apply-plan-change';
import { refuseDerivedDateEdit, DERIVED_DATE_TEACHING } from '../../packages/app/src/schedule/plan-edit';
import { closeAllPools, getDb, getPool } from '../../packages/db/src/client';
import {
  assertProbeTenantsDisjoint,
  buildProbeTenant,
  createProbeTenant,
  removeProbeTenant,
} from '../../packages/db/src/probe-tenants';
import * as s from '../../packages/db/src/schema';
import { acquireSeedSuiteLock, releaseSeedSuiteLock } from '../../packages/db/src/seed-suite-lock';
import { inTenantTransaction } from '../../packages/db/src/tenant-transaction';
import { withTenant } from '../../packages/db/src/with-tenant';

const OWNER_DATABASE_URL = process.env.DATABASE_URL;
const APP_DATABASE_URL = process.env.APP_DATABASE_URL;
const REQUIRE_DB = process.env.REQUIRE_DB === '1';

async function reachableAs(connectionString: string | undefined): Promise<boolean> {
  if (!connectionString) return false;
  try {
    const client = await getPool(connectionString).connect();
    client.release();
    return true;
  } catch {
    return false;
  }
}

const reachable =
  (await reachableAs(OWNER_DATABASE_URL)) && (await reachableAs(APP_DATABASE_URL));
if (REQUIRE_DB && !reachable) {
  throw new Error('REQUIRE_DB=1 but DATABASE_URL or APP_DATABASE_URL is unreachable.');
}

const PROBE = buildProbeTenant('xtprobe-s210', 950_000_000);
assertProbeTenantsDisjoint([PROBE]);

if (reachable) {
  await acquireSeedSuiteLock(OWNER_DATABASE_URL!, 'shared');
}

afterAll(async () => {
  if (reachable) {
    await removeProbeTenant(getDb(OWNER_DATABASE_URL!), PROBE).catch(() => {});
  }
  await releaseSeedSuiteLock();
  await closeAllPools();
});

function ctx() {
  return {
    tenantId: PROBE.tenantId,
    userId: 'user-s210',
    roles: ['pm'] as const,
    locale: 'en' as const,
    projectIds: [PROBE.projectId],
  };
}

async function prepareSchedulableProject(owner: ReturnType<typeof getDb>) {
  await createProbeTenant(owner, PROBE);
  const leaf = PROBE.state.wps.find((w) => w.isLeaf && !w.isMilestone);
  if (!leaf) throw new Error('fixture needs a leaf WP');
  await withTenant(owner, PROBE.tenantId, async (tx) => {
    await tx
      .update(s.project)
      .set({ projectStart: '2026-09-01', dataDate: '2026-10-05', projectFinish: null })
      .where(eq(s.project.id, PROBE.projectId));
    await tx
      .update(s.workPackage)
      .set({ durationDays: 3, constraintType: 'asap', constraintDate: null })
      .where(
        and(
          eq(s.workPackage.tenantId, PROBE.tenantId),
          eq(s.workPackage.projectId, PROBE.projectId),
          eq(s.workPackage.id, leaf.id),
        ),
      );
  });
  return leaf;
}

describe.skipIf(!reachable)('applyPlanChange fence (story 2.10)', () => {
  it('creates a leaf WP and appends schedule_run with cause wp_created', async () => {
    const owner = getDb(OWNER_DATABASE_URL!);
    const app = getDb(APP_DATABASE_URL!);
    await prepareSchedulableProject(owner);

    const result = await applyPlanChange(
      { handle: app, transaction: inTenantTransaction },
      ctx(),
      {
        kind: 'create_wp',
        projectId: PROBE.projectId,
        wpId: `${PROBE.tenantId}-wp-new`,
        parentId: null,
        wbsCode: '99.1',
        name: 'New leaf',
        durationDays: 2,
      },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const runs = await withTenant(app, PROBE.tenantId, async (tx) =>
      tx
        .select({ cause: s.scheduleRun.cause })
        .from(s.scheduleRun)
        .where(
          and(
            eq(s.scheduleRun.tenantId, PROBE.tenantId),
            eq(s.scheduleRun.projectId, PROBE.projectId),
          ),
        ),
    );
    expect(runs.some((r) => r.cause === 'wp_created')).toBe(true);
  });

  it('soft-deletes a WP with edges and does not relink', async () => {
    const owner = getDb(OWNER_DATABASE_URL!);
    const app = getDb(APP_DATABASE_URL!);
    const leafA = await prepareSchedulableProject(owner);
    const leafB = PROBE.state.wps.find((w) => w.isLeaf && !w.isMilestone && w.id !== leafA.id);
    if (!leafB) throw new Error('need two leaves');

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

    const deleted = await applyPlanChange(
      { handle: app, transaction: inTenantTransaction },
      ctx(),
      { kind: 'delete_wp', projectId: PROBE.projectId, wpId: leafA.id },
    );
    expect(deleted.ok).toBe(true);
    if (!deleted.ok) return;

    const edges = await withTenant(app, PROBE.tenantId, async (tx) =>
      tx
        .select()
        .from(s.wpDependency)
        .where(
          and(
            eq(s.wpDependency.tenantId, PROBE.tenantId),
            eq(s.wpDependency.projectId, PROBE.projectId),
          ),
        ),
    );
    expect(edges).toHaveLength(0);

    const [wp] = await withTenant(app, PROBE.tenantId, async (tx) =>
      tx
        .select({ deletedAt: s.workPackage.deletedAt })
        .from(s.workPackage)
        .where(eq(s.workPackage.id, leafA.id)),
    );
    expect(wp?.deletedAt).not.toBeNull();

    const runs = await withTenant(app, PROBE.tenantId, async (tx) =>
      tx
        .select({ cause: s.scheduleRun.cause })
        .from(s.scheduleRun)
        .where(eq(s.scheduleRun.projectId, PROBE.projectId)),
    );
    expect(runs.some((r) => r.cause === 'wp_deleted')).toBe(true);
  });

  it('refuses actual finish before start', async () => {
    const owner = getDb(OWNER_DATABASE_URL!);
    const app = getDb(APP_DATABASE_URL!);
    const leaf = await prepareSchedulableProject(owner);

    const result = await applyPlanChange(
      { handle: app, transaction: inTenantTransaction },
      ctx(),
      {
        kind: 'patch_actual_dates',
        projectId: PROBE.projectId,
        wpId: leaf.id,
        actualStart: '2026-10-10',
        actualFinish: '2026-10-01',
        source: 'typed',
      },
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('invalid_input');
  });

  it('compound advances data_date with actual finish when confirmed', async () => {
    const owner = getDb(OWNER_DATABASE_URL!);
    const app = getDb(APP_DATABASE_URL!);
    const leaf = await prepareSchedulableProject(owner);

    const declined = await applyPlanChange(
      { handle: app, transaction: inTenantTransaction },
      ctx(),
      {
        kind: 'patch_actual_dates',
        projectId: PROBE.projectId,
        wpId: leaf.id,
        actualStart: '2026-10-01',
        actualFinish: '2026-10-20',
        source: 'typed',
      },
    );
    expect(declined.ok).toBe(false);

    const accepted = await applyPlanChange(
      { handle: app, transaction: inTenantTransaction },
      ctx(),
      {
        kind: 'patch_actual_dates',
        projectId: PROBE.projectId,
        wpId: leaf.id,
        actualStart: '2026-10-01',
        actualFinish: '2026-10-20',
        source: 'typed',
        advanceDataDate: '2026-10-20',
      },
    );
    expect(accepted.ok).toBe(true);
    if (!accepted.ok) return;

    const [project] = await withTenant(app, PROBE.tenantId, async (tx) =>
      tx.select({ dataDate: s.project.dataDate }).from(s.project).where(eq(s.project.id, PROBE.projectId)),
    );
    expect(project?.dataDate).toBe('2026-10-20');

    const status = await withTenant(app, PROBE.tenantId, async (tx) =>
      tx
        .select()
        .from(s.wpStatusEvent)
        .where(
          and(
            eq(s.wpStatusEvent.projectId, PROBE.projectId),
            eq(s.wpStatusEvent.wpId, leaf.id),
          ),
        ),
    );
    expect(status.length).toBeGreaterThan(0);
    expect(status[status.length - 1]!.actualFinish).toBe('2026-10-20');
  });

  it('writes recorded pct via pct_override_event and resolves watermark', async () => {
    const owner = getDb(OWNER_DATABASE_URL!);
    const app = getDb(APP_DATABASE_URL!);
    const leaf = await prepareSchedulableProject(owner);

    const result = await applyPlanChange(
      { handle: app, transaction: inTenantTransaction },
      ctx(),
      {
        kind: 'patch_recorded_pct',
        projectId: PROBE.projectId,
        wpId: leaf.id,
        recordedPctNum: 25n,
        recordedPctDen: 100n,
      },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const events = await withTenant(app, PROBE.tenantId, async (tx) =>
      tx
        .select()
        .from(s.pctOverrideEvent)
        .where(eq(s.pctOverrideEvent.projectId, PROBE.projectId)),
    );
    expect(events).toHaveLength(1);
    expect(events[0]!.recordedPctNum).toBe(25n);

    const runs = await withTenant(app, PROBE.tenantId, async (tx) =>
      tx
        .select({ cause: s.scheduleRun.cause, inputs: s.scheduleRun.inputs })
        .from(s.scheduleRun)
        .where(eq(s.scheduleRun.projectId, PROBE.projectId))
        .orderBy(s.scheduleRun.seq),
    );
    expect(runs.some((r) => r.cause === 'progress')).toBe(true);
    const latest = runs[runs.length - 1]!;
    const raw = latest.inputs as { watermarks?: { pctOverrideSeqMax?: number } };
    expect((raw.watermarks?.pctOverrideSeqMax ?? 0) > 0).toBe(true);
  });

  it('leaf→summary clears leaf-only columns in the same action with drop resolution', async () => {
    const owner = getDb(OWNER_DATABASE_URL!);
    const app = getDb(APP_DATABASE_URL!);
    const leaf = await prepareSchedulableProject(owner);

    const result = await applyPlanChange(
      { handle: app, transaction: inTenantTransaction },
      ctx(),
      {
        kind: 'create_wp',
        projectId: PROBE.projectId,
        wpId: `${PROBE.tenantId}-child`,
        parentId: leaf.id,
        wbsCode: `${leaf.wbsCode}.1`,
        name: 'Child under former leaf',
        durationDays: 1,
        leafResolution: { strategy: 'drop' },
      },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const [parent] = await withTenant(app, PROBE.tenantId, async (tx) =>
      tx
        .select({
          childCount: s.workPackage.childCount,
          isLeaf: s.workPackage.isLeaf,
          durationDays: s.workPackage.durationDays,
          constraintType: s.workPackage.constraintType,
        })
        .from(s.workPackage)
        .where(eq(s.workPackage.id, leaf.id)),
    );
    expect(parent?.isLeaf).toBe(false);
    expect(parent?.childCount).toBeGreaterThanOrEqual(1);
    expect(parent?.durationDays).toBeNull();
    expect(parent?.constraintType).toBe('asap');
  });

  it('100 CF definitions meet write-path probe; 101st is warned not blocked', async () => {
    const owner = getDb(OWNER_DATABASE_URL!);
    const app = getDb(APP_DATABASE_URL!);
    await prepareSchedulableProject(owner);

    for (let i = 0; i < 100; i++) {
      const r = await applyPlanChange(
        { handle: app, transaction: inTenantTransaction },
        ctx(),
        {
          kind: 'create_custom_field_definition',
          projectId: PROBE.projectId,
          definitionId: `${PROBE.tenantId}-cf-${i}`,
          name: `Field ${i}`,
          fieldType: 'text',
        },
      );
      expect(r.ok).toBe(true);
    }

    const warned = await applyPlanChange(
      { handle: app, transaction: inTenantTransaction },
      ctx(),
      {
        kind: 'create_custom_field_definition',
        projectId: PROBE.projectId,
        definitionId: `${PROBE.tenantId}-cf-100`,
        name: 'Field 100',
        fieldType: 'text',
      },
    );
    expect(warned.ok).toBe(true);
    if (!warned.ok) return;
    expect(warned.value.warnings).toContain('custom_field_definition_untested_bound');
  }, 120_000);

  it('reparents a WP under a new parent', async () => {
    const owner = getDb(OWNER_DATABASE_URL!);
    const app = getDb(APP_DATABASE_URL!);
    const leaf = await prepareSchedulableProject(owner);
    const summary = PROBE.state.wps.find((w) => !w.isLeaf);
    if (!summary) throw new Error('need a summary');

    // Create a free root leaf then move it under the summary.
    const created = await applyPlanChange(
      { handle: app, transaction: inTenantTransaction },
      ctx(),
      {
        kind: 'create_wp',
        projectId: PROBE.projectId,
        wpId: `${PROBE.tenantId}-move-me`,
        parentId: null,
        wbsCode: '88.1',
        name: 'Movable',
        durationDays: 1,
      },
    );
    expect(created.ok).toBe(true);

    const moved = await applyPlanChange(
      { handle: app, transaction: inTenantTransaction },
      ctx(),
      {
        kind: 'reparent_wp',
        projectId: PROBE.projectId,
        wpId: `${PROBE.tenantId}-move-me`,
        newParentId: summary.id,
      },
    );
    expect(moved.ok).toBe(true);
    if (!moved.ok) return;

    const [row] = await withTenant(app, PROBE.tenantId, async (tx) =>
      tx
        .select({ parentId: s.workPackage.parentId })
        .from(s.workPackage)
        .where(eq(s.workPackage.id, `${PROBE.tenantId}-move-me`)),
    );
    expect(row?.parentId).toBe(summary.id);
    void leaf;
  });
});

describe('derived-date teaching refuse (story 2.10)', () => {
  it('refuses without writing and carries teaching copy', () => {
    const result = refuseDerivedDateEdit();
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.details?.message?.[0]).toBe(DERIVED_DATE_TEACHING);
  });
});
