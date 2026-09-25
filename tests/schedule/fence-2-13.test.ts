/**
 * Story 2.13 fence + plan-grid read: inline name/duration/% through the fence, getPlanGridState
 * order and schedule projection after a run.
 */
import { afterAll, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { compareWp } from '../../packages/domain/src/schedule/order';
import { applyPlanChange } from '../../packages/app/src/schedule/apply-plan-change';
import { getPlanGridState } from '../../packages/app/src/schedule/plan-grid';
import {
  refuseDerivedDateEdit,
  DERIVED_DATE_TEACHING,
} from '../../packages/app/src/schedule/plan-edit';
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

const PROBE = buildProbeTenant('xtprobe-s213', 955_000_000);
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
    userId: 'user-s213',
    roles: ['pm'] as const,
    locale: 'en' as const,
    projectIds: [PROBE.projectId],
  };
}

async function prepareSchedulable(owner: ReturnType<typeof getDb>) {
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

describe('derived-date teaching refuse (story 2.13 matrix)', () => {
  it('refuses without writing', () => {
    const result = refuseDerivedDateEdit();
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.details?.derivedDate).toEqual(['teaching_refuse']);
    expect(result.error.details?.message?.[0]).toBe(DERIVED_DATE_TEACHING);
  });
});

describe.skipIf(!reachable)('plan grid fence + read (story 2.13)', () => {
  it('renames a WP through patch_wp_name and refreshes the grid projection', async () => {
    const owner = getDb(OWNER_DATABASE_URL!);
    const app = getDb(APP_DATABASE_URL!);
    const leaf = await prepareSchedulable(owner);

    const renamed = await applyPlanChange(
      { handle: app, transaction: inTenantTransaction },
      ctx(),
      {
        kind: 'patch_wp_name',
        projectId: PROBE.projectId,
        wpId: leaf.id,
        name: 'Renamed leaf for 2.13',
      },
    );
    expect(renamed.ok).toBe(true);
    if (!renamed.ok) return;

    const grid = await getPlanGridState(
      { handle: app, transaction: inTenantTransaction },
      ctx(),
      { projectId: PROBE.projectId },
    );
    expect(grid.ok).toBe(true);
    if (!grid.ok) return;

    // No Project finish → Float measured against computed finish.
    expect(grid.value.floatAnchorLabel).toBe('vs computed finish');
    expect(grid.value.projectFinish).toBeNull();
    expect(grid.value.haltedReason).toBeNull();
    expect(grid.value.scheduleStale).toBe(false);

    // Display order is compareWp, never SQL WBS alone.
    const orderKeys = grid.value.rows.map((r) => ({ id: r.wpId, wbsCode: r.wbsCode }));
    expect(orderKeys).toEqual([...orderKeys].sort(compareWp));

    const row = grid.value.rows.find((r) => r.wpId === leaf.id);
    expect(row?.name).toBe('Renamed leaf for 2.13');
    expect(row?.earlyStart).not.toBeNull();
    expect(row?.earlyFinish).not.toBeNull();
    expect(row?.durationDays).toBe(3);
    expect(row?.floatDays).not.toBeNull();
    expect(typeof row?.isCritical).toBe('boolean');
    // Simple ASAP leaf after a clean run has no exception cell.
    expect(row?.exception).toBeNull();
    expect(grid.value.rows.length).toBeGreaterThan(0);
  });

  it('patches duration then recorded %; remainingDays recomputes on the grid', async () => {
    const owner = getDb(OWNER_DATABASE_URL!);
    const app = getDb(APP_DATABASE_URL!);
    const leaf = await prepareSchedulable(owner);

    const duration = await applyPlanChange(
      { handle: app, transaction: inTenantTransaction },
      ctx(),
      {
        kind: 'patch_duration',
        projectId: PROBE.projectId,
        wpId: leaf.id,
        durationDays: 10,
      },
    );
    expect(duration.ok).toBe(true);

    const pct = await applyPlanChange(
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
    expect(pct.ok).toBe(true);
    if (!pct.ok) return;

    const grid = await getPlanGridState(
      { handle: app, transaction: inTenantTransaction },
      ctx(),
      { projectId: PROBE.projectId },
    );
    expect(grid.ok).toBe(true);
    if (!grid.ok) return;
    const row = grid.value.rows.find((r) => r.wpId === leaf.id);
    expect(row?.durationDays).toBe(10);
    expect(row?.recordedPct).toEqual({ num: 25n, den: 100n });
    expect(row?.remainingDays).toBe(8);
    expect(row?.floatDays).not.toBeNull();
    expect(typeof row?.isCritical).toBe('boolean');
  });

  it('blanks derived dates/Float/Critical when wp_schedule rows are stale', async () => {
    const owner = getDb(OWNER_DATABASE_URL!);
    const app = getDb(APP_DATABASE_URL!);
    const leaf = await prepareSchedulable(owner);

    const seeded = await applyPlanChange(
      { handle: app, transaction: inTenantTransaction },
      ctx(),
      {
        kind: 'patch_duration',
        projectId: PROBE.projectId,
        wpId: leaf.id,
        durationDays: 4,
      },
    );
    expect(seeded.ok).toBe(true);

    await withTenant(owner, PROBE.tenantId, async (tx) => {
      await tx
        .update(s.wpSchedule)
        .set({ stale: true })
        .where(
          and(
            eq(s.wpSchedule.tenantId, PROBE.tenantId),
            eq(s.wpSchedule.projectId, PROBE.projectId),
          ),
        );
    });

    const grid = await getPlanGridState(
      { handle: app, transaction: inTenantTransaction },
      ctx(),
      { projectId: PROBE.projectId },
    );
    expect(grid.ok).toBe(true);
    if (!grid.ok) return;
    expect(grid.value.scheduleStale).toBe(true);
    const row = grid.value.rows.find((r) => r.wpId === leaf.id);
    expect(row?.earlyStart).toBeNull();
    expect(row?.earlyFinish).toBeNull();
    expect(row?.floatDays).toBeNull();
    expect(row?.isCritical).toBe(false);
  });

  it('summary FR-6a: patch_duration on a summary refuses and leaves the grid unchanged', async () => {
    const owner = getDb(OWNER_DATABASE_URL!);
    const app = getDb(APP_DATABASE_URL!);
    await prepareSchedulable(owner);
    const summary = PROBE.state.wps.find((w) => !w.isLeaf);
    if (!summary) throw new Error('fixture needs a summary WP');

    const before = await getPlanGridState(
      { handle: app, transaction: inTenantTransaction },
      ctx(),
      { projectId: PROBE.projectId },
    );
    expect(before.ok).toBe(true);
    if (!before.ok) return;

    const refused = await applyPlanChange(
      { handle: app, transaction: inTenantTransaction },
      ctx(),
      {
        kind: 'patch_duration',
        projectId: PROBE.projectId,
        wpId: summary.id,
        durationDays: 5,
      },
    );
    expect(refused.ok).toBe(false);

    const after = await getPlanGridState(
      { handle: app, transaction: inTenantTransaction },
      ctx(),
      { projectId: PROBE.projectId },
    );
    expect(after.ok).toBe(true);
    if (!after.ok) return;
    expect(after.value.rows.map((r) => r.wpId)).toEqual(before.value.rows.map((r) => r.wpId));
  });
});
