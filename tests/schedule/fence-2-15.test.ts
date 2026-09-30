/**
 * Story 2.15 fence + plan-grid: strip settings kinds, min Float, What-moved join.
 */
import { describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { applyPlanChange } from '../../packages/app/src/schedule/apply-plan-change';
import {
  floatAnchorSentence,
  getPlanGridState,
} from '../../packages/app/src/schedule/plan-grid';
import { PROJECT_FINISH_TEACHING } from '../../packages/app/src/schedule/plan-edit';
import { getDb } from '../../packages/db/src/client';
import {
  assertProbeTenantsDisjoint,
  buildProbeTenant,
} from '../../packages/db/src/probe-tenants';
import * as s from '../../packages/db/src/schema';
import { inTenantTransaction } from '../../packages/db/src/tenant-transaction';
import { withTenant } from '../../packages/db/src/with-tenant';
import {
  connectFenceHarness,
  installFenceAfterAll,
  pmCtx,
  prepareSchedulableLeaf,
} from './fence-harness';

const OWNER_DATABASE_URL = process.env.DATABASE_URL;
const APP_DATABASE_URL = process.env.APP_DATABASE_URL;

const { reachable } = await connectFenceHarness({
  ownerUrl: OWNER_DATABASE_URL,
  appUrl: APP_DATABASE_URL,
  requireDb: process.env.REQUIRE_DB === '1',
});

const PROBE = buildProbeTenant('xtprobe-s215', 957_000_000);
assertProbeTenantsDisjoint([PROBE]);
installFenceAfterAll({ reachable, ownerUrl: OWNER_DATABASE_URL, probe: PROBE });

const ctx = (userId = 'user-s215') => pmCtx(PROBE, { userId });
const prepareSchedulable = (owner: ReturnType<typeof getDb>) =>
  prepareSchedulableLeaf(owner, PROBE);

describe('strip sentence helpers (story 2.15)', () => {
  it('matches UX-DR5 Project finish vs relative computed finish copy', () => {
    expect(
      floatAnchorSentence({ kind: 'project_finish', date: '2027-03-31' }, '2027-03-31'),
    ).toBe('Float measured against the Project finish, 31 Mar 2027');
    expect(
      floatAnchorSentence({ kind: 'computed_finish', date: '2027-03-12' }, null),
    ).toContain('relative, because no Project finish is set');
    expect(PROJECT_FINISH_TEACHING).toMatch(/moves no work package/);
  });
});

describe.skipIf(!reachable)('plan strip + What-moved (story 2.15)', () => {
  it('surfaces min Float, anchor sentence, and nothing-moved on the first run', async () => {
    const owner = getDb(OWNER_DATABASE_URL!);
    const app = getDb(APP_DATABASE_URL!);
    const leaf = await prepareSchedulable(owner);

    const first = await applyPlanChange(
      { handle: app, transaction: inTenantTransaction },
      ctx(),
      {
        kind: 'patch_duration',
        projectId: PROBE.projectId,
        wpId: leaf.id,
        durationDays: 5,
      },
    );
    expect(first.ok).toBe(true);

    const grid = await getPlanGridState(
      { handle: app, transaction: inTenantTransaction },
      ctx(),
      { projectId: PROBE.projectId },
    );
    expect(grid.ok).toBe(true);
    if (!grid.ok) return;

    expect(grid.value.floatAnchorLabel).toBe('vs computed finish');
    expect(grid.value.floatAnchorSentence).toMatch(/relative, because no Project finish is set/);
    expect(grid.value.minFloat).not.toBeNull();
    expect(grid.value.finishTeaching).toBe(PROJECT_FINISH_TEACHING);
    expect(grid.value.whatMoved).not.toBeNull();
    expect(grid.value.whatMoved?.nothingMoved).toBe(true);
    expect(grid.value.whatMoved?.summaryLine).toBe('No dates moved');
    expect(grid.value.whatMoved?.actorUserId).toBe('user-s215');
  });

  it('patches Project finish through the fence and groups What-moved causes', async () => {
    const owner = getDb(OWNER_DATABASE_URL!);
    const app = getDb(APP_DATABASE_URL!);
    const leaf = await prepareSchedulable(owner);

    const seed = await applyPlanChange(
      { handle: app, transaction: inTenantTransaction },
      ctx(),
      {
        kind: 'patch_duration',
        projectId: PROBE.projectId,
        wpId: leaf.id,
        durationDays: 5,
      },
    );
    expect(seed.ok).toBe(true);

    const finish = await applyPlanChange(
      { handle: app, transaction: inTenantTransaction },
      ctx(),
      {
        kind: 'patch_project_finish',
        projectId: PROBE.projectId,
        projectFinish: '2026-10-01',
      },
    );
    expect(finish.ok).toBe(true);

    const afterFinish = await getPlanGridState(
      { handle: app, transaction: inTenantTransaction },
      ctx(),
      { projectId: PROBE.projectId },
    );
    expect(afterFinish.ok).toBe(true);
    if (!afterFinish.ok) return;
    expect(afterFinish.value.projectFinish).toBe('2026-10-01');
    expect(afterFinish.value.floatAnchorSentence).toMatch(
      /Float measured against the Project finish/,
    );

    // Duration change after a finish is set — expect FR-28 edited cause when dates move.
    const duration = await applyPlanChange(
      { handle: app, transaction: inTenantTransaction },
      ctx('user-s215-other'),
      {
        kind: 'patch_duration',
        projectId: PROBE.projectId,
        wpId: leaf.id,
        durationDays: 12,
      },
    );
    expect(duration.ok).toBe(true);

    const grid = await getPlanGridState(
      { handle: app, transaction: inTenantTransaction },
      ctx(),
      { projectId: PROBE.projectId },
    );
    expect(grid.ok).toBe(true);
    if (!grid.ok) return;

    const band = grid.value.whatMoved;
    expect(band).not.toBeNull();
    if (!band) return;
    expect(band.nothingMoved).toBe(false);
    expect(band.movedCount).toBeGreaterThan(0);
    expect(band.groups.length).toBeGreaterThan(0);
    for (const group of band.groups) {
      expect([
        'edited',
        'moved by a predecessor',
        'calendar changed',
        'data date advanced',
        'actual dates recorded',
        'progress changed',
        'project dates changed',
      ]).toContain(group.cause);
    }
    expect(band.summaryLine).toMatch(/work package/);
    expect(band.politeAnnounce).toMatch(/Computed finish/);
    expect(band.actorUserId).toBe('user-s215-other');
  });

  it('refuses strip-equivalent Data Date without Project start', async () => {
    const owner = getDb(OWNER_DATABASE_URL!);
    const app = getDb(APP_DATABASE_URL!);
    await createProbeTenant(owner, PROBE);
    await withTenant(owner, PROBE.tenantId, async (tx) => {
      await tx
        .update(s.project)
        .set({ projectStart: null, dataDate: null, projectFinish: null })
        .where(eq(s.project.id, PROBE.projectId));
    });

    const refused = await applyPlanChange(
      { handle: app, transaction: inTenantTransaction },
      ctx(),
      {
        kind: 'patch_data_date',
        projectId: PROBE.projectId,
        dataDate: '2026-10-05',
      },
    );
    expect(refused.ok).toBe(false);
  });

  it('set_project_start then clear_project_start refreshes strip scalars (same fence path as strip)', async () => {
    const owner = getDb(OWNER_DATABASE_URL!);
    const app = getDb(APP_DATABASE_URL!);
    await createProbeTenant(owner, PROBE);
    await withTenant(owner, PROBE.tenantId, async (tx) => {
      await tx
        .update(s.project)
        .set({ projectStart: null, dataDate: null, projectFinish: null })
        .where(eq(s.project.id, PROBE.projectId));
      const leaf = PROBE.state.wps.find((w) => w.isLeaf && !w.isMilestone);
      if (!leaf) throw new Error('fixture needs a leaf WP');
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

    const before = await getPlanGridState(
      { handle: app, transaction: inTenantTransaction },
      ctx(),
      { projectId: PROBE.projectId },
    );
    expect(before.ok).toBe(true);
    if (!before.ok) return;
    expect(before.value.projectStart).toBeNull();
    expect(before.value.computedFinish).toBeNull();
    expect(before.value.minFloat).toBeNull();

    const setStart = await applyPlanChange(
      { handle: app, transaction: inTenantTransaction },
      ctx(),
      {
        kind: 'set_project_start',
        projectId: PROBE.projectId,
        projectStart: '2026-09-01',
      },
    );
    expect(setStart.ok).toBe(true);

    const afterSet = await getPlanGridState(
      { handle: app, transaction: inTenantTransaction },
      ctx(),
      { projectId: PROBE.projectId },
    );
    expect(afterSet.ok).toBe(true);
    if (!afterSet.ok) return;
    expect(afterSet.value.projectStart).toBe('2026-09-01');
    expect(afterSet.value.dataDate).not.toBeNull();
    expect(afterSet.value.computedFinish).not.toBeNull();
    expect(afterSet.value.minFloat).not.toBeNull();
    expect(afterSet.value.floatAnchorSentence).toMatch(/Float measured against/);

    const cleared = await applyPlanChange(
      { handle: app, transaction: inTenantTransaction },
      ctx(),
      {
        kind: 'clear_project_start',
        projectId: PROBE.projectId,
      },
    );
    expect(cleared.ok).toBe(true);

    const afterClear = await getPlanGridState(
      { handle: app, transaction: inTenantTransaction },
      ctx(),
      { projectId: PROBE.projectId },
    );
    expect(afterClear.ok).toBe(true);
    if (!afterClear.ok) return;
    expect(afterClear.value.projectStart).toBeNull();
  });
});
