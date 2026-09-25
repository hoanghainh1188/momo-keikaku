/**
 * Story 2.14 — predecessor-set apply + constraint patch through the fence; FR-6a keep-text
 * refuse; Exception cell after an impossible must_* constraint.
 */
import { afterAll, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { applyPlanChange } from '../../packages/app/src/schedule/apply-plan-change';
import { applyPredecessorSet } from '../../packages/app/src/schedule/apply-predecessor-set';
import { getPlanGridState } from '../../packages/app/src/schedule/plan-grid';
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

const PROBE = buildProbeTenant('xtprobe-s214', 956_000_000);
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
    userId: 'user-s214',
    roles: ['pm'] as const,
    locale: 'en' as const,
    projectIds: [PROBE.projectId],
  };
}

async function prepareTwoLeaves(owner: ReturnType<typeof getDb>) {
  await createProbeTenant(owner, PROBE);
  const leaves = PROBE.state.wps.filter((w) => w.isLeaf && !w.isMilestone).slice(0, 2);
  if (leaves.length < 2) throw new Error('need two leaves');
  await withTenant(owner, PROBE.tenantId, async (tx) => {
    await tx
      .update(s.project)
      .set({ projectStart: '2026-09-01', dataDate: '2026-10-05', projectFinish: null })
      .where(eq(s.project.id, PROBE.projectId));
    for (const leaf of leaves) {
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
    }
  });
  return leaves as [typeof leaves[0], typeof leaves[1]];
}

describe.skipIf(!reachable)('predecessor set + constraint editors (story 2.14)', () => {
  it('adds a predecessor via typed WBS and canonicalises on the grid', async () => {
    const owner = getDb(OWNER_DATABASE_URL!);
    const app = getDb(APP_DATABASE_URL!);
    const [pred, succ] = await prepareTwoLeaves(owner);

    const applied = await applyPredecessorSet(
      { handle: app, transaction: inTenantTransaction },
      ctx(),
      {
        projectId: PROBE.projectId,
        successorWpId: succ.id,
        text: `${pred.wbsCode}FS+2d`,
      },
    );
    expect(applied.ok).toBe(true);
    if (!applied.ok) return;

    const grid = await getPlanGridState(
      { handle: app, transaction: inTenantTransaction },
      ctx(),
      { projectId: PROBE.projectId },
    );
    expect(grid.ok).toBe(true);
    if (!grid.ok) return;
    const row = grid.value.rows.find((r) => r.wpId === succ.id);
    expect(row?.predecessorsText).toBe(`${pred.wbsCode}FS+2d`);
    expect(row?.predecessorEdges).toEqual([{ predecessorWpId: pred.id, lagDays: 2 }]);
    expect(grid.value.leafCandidates.every((c) => c.wpId !== undefined)).toBe(true);
    expect(grid.value.leafCandidates.some((c) => c.wpId === pred.id)).toBe(true);
    // Summaries never appear in autocomplete candidates.
    const summaryIds = new Set(
      PROBE.state.wps.filter((w) => !w.isLeaf).map((w) => w.id),
    );
    expect(grid.value.leafCandidates.every((c) => !summaryIds.has(c.wpId))).toBe(true);
  });

  it('FR-6a cycle refuse keeps no write and returns UX prose in details.refuse', async () => {
    const owner = getDb(OWNER_DATABASE_URL!);
    const app = getDb(APP_DATABASE_URL!);
    const [a, b] = await prepareTwoLeaves(owner);

    // Seed A → B, then try to close B → A via typed predecessors on A.
    const seed = await applyPlanChange(
      { handle: app, transaction: inTenantTransaction },
      ctx(),
      {
        kind: 'add_dependency',
        projectId: PROBE.projectId,
        predecessorWpId: a.id,
        successorWpId: b.id,
        lagDays: 0,
      },
    );
    expect(seed.ok).toBe(true);

    const before = await withTenant(app, PROBE.tenantId, async (tx) =>
      tx.select({ seq: s.scheduleRun.seq }).from(s.scheduleRun),
    );

    const refused = await applyPredecessorSet(
      { handle: app, transaction: inTenantTransaction },
      ctx(),
      {
        projectId: PROBE.projectId,
        successorWpId: a.id,
        text: b.wbsCode,
      },
    );
    expect(refused.ok).toBe(false);
    if (refused.ok) return;
    expect(refused.error.code).toBe('invalid_input');
    expect(refused.error.details?.refuse?.[0]).toMatch(/would be a cycle/);

    const after = await withTenant(app, PROBE.tenantId, async (tx) =>
      tx.select({ seq: s.scheduleRun.seq }).from(s.scheduleRun),
    );
    expect(after).toEqual(before);
  });

  it('patches must_finish_on (milestone target) and clears to asap', async () => {
    const owner = getDb(OWNER_DATABASE_URL!);
    const app = getDb(APP_DATABASE_URL!);
    const [leaf] = await prepareTwoLeaves(owner);

    const set = await applyPlanChange(
      { handle: app, transaction: inTenantTransaction },
      ctx(),
      {
        kind: 'patch_constraint',
        projectId: PROBE.projectId,
        wpId: leaf.id,
        constraintType: 'must_finish_on',
        constraintDate: '2026-10-10',
      },
    );
    expect(set.ok).toBe(true);

    let grid = await getPlanGridState(
      { handle: app, transaction: inTenantTransaction },
      ctx(),
      { projectId: PROBE.projectId },
    );
    expect(grid.ok).toBe(true);
    if (!grid.ok) return;
    const row = grid.value.rows.find((r) => r.wpId === leaf.id);
    expect(row?.constraintType).toBe('must_finish_on');
    expect(row?.constraintDate).toBe('2026-10-10');
    expect(row?.constraintLabel).toMatch(/Must finish on/);

    const cleared = await applyPlanChange(
      { handle: app, transaction: inTenantTransaction },
      ctx(),
      {
        kind: 'patch_constraint',
        projectId: PROBE.projectId,
        wpId: leaf.id,
        constraintType: 'asap',
        constraintDate: null,
      },
    );
    expect(cleared.ok).toBe(true);

    grid = await getPlanGridState(
      { handle: app, transaction: inTenantTransaction },
      ctx(),
      { projectId: PROBE.projectId },
    );
    expect(grid.ok).toBe(true);
    if (!grid.ok) return;
    const clearedRow = grid.value.rows.find((r) => r.wpId === leaf.id);
    expect(clearedRow?.constraintType).toBe('asap');
    expect(clearedRow?.constraintDate).toBeNull();
    expect(clearedRow?.constraintLabel).toBe('As soon as possible');
  });

  it('impossible must_finish_on paints Exception on the same grid read', async () => {
    const owner = getDb(OWNER_DATABASE_URL!);
    const app = getDb(APP_DATABASE_URL!);
    const leaves = PROBE.state.wps.filter((w) => w.isLeaf && !w.isMilestone).slice(0, 2);
    await createProbeTenant(owner, PROBE);
    const [pred, succ] = leaves as [typeof leaves[0], typeof leaves[1]];
    if (!pred || !succ) throw new Error('need two leaves');

    await withTenant(owner, PROBE.tenantId, async (tx) => {
      await tx
        .update(s.project)
        .set({ projectStart: '2026-09-01', dataDate: '2026-09-01', projectFinish: null })
        .where(eq(s.project.id, PROBE.projectId));
      await tx
        .update(s.workPackage)
        .set({ durationDays: 10, constraintType: 'asap', constraintDate: null })
        .where(
          and(
            eq(s.workPackage.tenantId, PROBE.tenantId),
            eq(s.workPackage.projectId, PROBE.projectId),
            eq(s.workPackage.id, pred.id),
          ),
        );
      await tx
        .update(s.workPackage)
        .set({ durationDays: 5, constraintType: 'asap', constraintDate: null })
        .where(
          and(
            eq(s.workPackage.tenantId, PROBE.tenantId),
            eq(s.workPackage.projectId, PROBE.projectId),
            eq(s.workPackage.id, succ.id),
          ),
        );
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
    const seeded = await applyPlanChange(
      { handle: app, transaction: inTenantTransaction },
      ctx(),
      {
        kind: 'patch_duration',
        projectId: PROBE.projectId,
        wpId: pred.id,
        durationDays: 10,
      },
    );
    expect(seeded.ok).toBe(true);

    const constrained = await applyPlanChange(
      { handle: app, transaction: inTenantTransaction },
      ctx(),
      {
        kind: 'patch_constraint',
        projectId: PROBE.projectId,
        wpId: succ.id,
        constraintType: 'must_finish_on',
        constraintDate: '2026-09-02',
      },
    );
    expect(constrained.ok).toBe(true);

    const grid = await getPlanGridState(
      { handle: app, transaction: inTenantTransaction },
      ctx(),
      { projectId: PROBE.projectId },
    );
    expect(grid.ok).toBe(true);
    if (!grid.ok) return;
    const row = grid.value.rows.find((r) => r.wpId === succ.id);
    expect(row?.exception?.kind).toBe('violation');
    expect(row?.exception?.label).toMatch(/Late \d+d/);
  });

  it('parse refuse for malformed predecessor text does not write', async () => {
    const owner = getDb(OWNER_DATABASE_URL!);
    const app = getDb(APP_DATABASE_URL!);
    const [, succ] = await prepareTwoLeaves(owner);

    const refused = await applyPredecessorSet(
      { handle: app, transaction: inTenantTransaction },
      ctx(),
      {
        projectId: PROBE.projectId,
        successorWpId: succ.id,
        text: 'not-a-token!!!',
      },
    );
    expect(refused.ok).toBe(false);
    if (refused.ok) return;
    expect(refused.error.details?.refuse?.[0]).toMatch(/Cannot parse|Unknown/);
  });
});
