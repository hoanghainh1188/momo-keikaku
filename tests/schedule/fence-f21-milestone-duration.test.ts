/**
 * Epic 2 retro F21: milestone ↔ duration pairing at the fence.
 * Matrix: create OK / create mismatch / patch_duration refuse & idempotent 0 /
 * mark milestone (coerce 0) / clear milestone (Q1→C → duration null).
 */
import { afterAll, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { applyPlanChange } from '../../packages/app/src/schedule/apply-plan-change';
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

const PROBE = buildProbeTenant('xtprobe-f21', 958_000_000);
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
    userId: 'user-f21',
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

async function loadWp(
  app: ReturnType<typeof getDb>,
  wpId: string,
): Promise<{ isMilestone: boolean; durationDays: number | null } | undefined> {
  const [row] = await withTenant(app, PROBE.tenantId, async (tx) =>
    tx
      .select({
        isMilestone: s.workPackage.isMilestone,
        durationDays: s.workPackage.durationDays,
      })
      .from(s.workPackage)
      .where(eq(s.workPackage.id, wpId)),
  );
  return row;
}

describe.skipIf(!reachable)('applyPlanChange fence (F21 milestone ↔ duration)', () => {
  it('creates a milestone with duration 0 (explicit)', async () => {
    const owner = getDb(OWNER_DATABASE_URL!);
    const app = getDb(APP_DATABASE_URL!);
    await prepareSchedulableProject(owner);
    const wpId = `${PROBE.tenantId}-ms-ok`;

    const result = await applyPlanChange(
      { handle: app, transaction: inTenantTransaction },
      ctx(),
      {
        kind: 'create_wp',
        projectId: PROBE.projectId,
        wpId,
        parentId: null,
        wbsCode: '91.1',
        name: 'Milestone OK',
        isMilestone: true,
        durationDays: 0,
      },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const wp = await loadWp(app, wpId);
    expect(wp).toEqual({ isMilestone: true, durationDays: 0 });
  });

  it('creates a milestone with omitted duration coerced to 0', async () => {
    const owner = getDb(OWNER_DATABASE_URL!);
    const app = getDb(APP_DATABASE_URL!);
    await prepareSchedulableProject(owner);
    const wpId = `${PROBE.tenantId}-ms-omit`;

    const result = await applyPlanChange(
      { handle: app, transaction: inTenantTransaction },
      ctx(),
      {
        kind: 'create_wp',
        projectId: PROBE.projectId,
        wpId,
        parentId: null,
        wbsCode: '91.2',
        name: 'Milestone omit duration',
        isMilestone: true,
      },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const wp = await loadWp(app, wpId);
    expect(wp).toEqual({ isMilestone: true, durationDays: 0 });
  });

  it('creates a milestone with null duration coerced to 0', async () => {
    const owner = getDb(OWNER_DATABASE_URL!);
    const app = getDb(APP_DATABASE_URL!);
    await prepareSchedulableProject(owner);
    const wpId = `${PROBE.tenantId}-ms-null`;

    const result = await applyPlanChange(
      { handle: app, transaction: inTenantTransaction },
      ctx(),
      {
        kind: 'create_wp',
        projectId: PROBE.projectId,
        wpId,
        parentId: null,
        wbsCode: '91.3',
        name: 'Milestone null duration',
        isMilestone: true,
        durationDays: null,
      },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const wp = await loadWp(app, wpId);
    expect(wp).toEqual({ isMilestone: true, durationDays: 0 });
  });

  it('refuses create_wp milestone with durationDays ≥ 1 and writes no row', async () => {
    const owner = getDb(OWNER_DATABASE_URL!);
    const app = getDb(APP_DATABASE_URL!);
    await prepareSchedulableProject(owner);
    const wpId = `${PROBE.tenantId}-ms-bad`;

    const result = await applyPlanChange(
      { handle: app, transaction: inTenantTransaction },
      ctx(),
      {
        kind: 'create_wp',
        projectId: PROBE.projectId,
        wpId,
        parentId: null,
        wbsCode: '91.4',
        name: 'Milestone mismatch',
        isMilestone: true,
        durationDays: 5,
      },
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('invalid_input');
    expect(result.error.details?.durationDays).toEqual(['milestone_must_be_zero']);

    const wp = await loadWp(app, wpId);
    expect(wp).toBeUndefined();
  });

  it('refuses patch_duration ≥ 1 or null on a milestone; allows idempotent 0', async () => {
    const owner = getDb(OWNER_DATABASE_URL!);
    const app = getDb(APP_DATABASE_URL!);
    const leaf = await prepareSchedulableProject(owner);

    const marked = await applyPlanChange(
      { handle: app, transaction: inTenantTransaction },
      ctx(),
      {
        kind: 'patch_milestone',
        projectId: PROBE.projectId,
        wpId: leaf.id,
        isMilestone: true,
      },
    );
    expect(marked.ok).toBe(true);
    if (!marked.ok) return;
    expect(await loadWp(app, leaf.id)).toEqual({ isMilestone: true, durationDays: 0 });

    const multiDay = await applyPlanChange(
      { handle: app, transaction: inTenantTransaction },
      ctx(),
      {
        kind: 'patch_duration',
        projectId: PROBE.projectId,
        wpId: leaf.id,
        durationDays: 3,
      },
    );
    expect(multiDay.ok).toBe(false);
    if (multiDay.ok) return;
    expect(multiDay.error.code).toBe('invalid_input');
    expect(multiDay.error.details?.durationDays).toEqual(['milestone_must_be_zero']);

    const cleared = await applyPlanChange(
      { handle: app, transaction: inTenantTransaction },
      ctx(),
      {
        kind: 'patch_duration',
        projectId: PROBE.projectId,
        wpId: leaf.id,
        durationDays: null,
      },
    );
    expect(cleared.ok).toBe(false);
    if (cleared.ok) return;
    expect(cleared.error.code).toBe('invalid_input');
    expect(cleared.error.details?.durationDays).toEqual(['milestone_must_be_zero']);

    const stayZero = await applyPlanChange(
      { handle: app, transaction: inTenantTransaction },
      ctx(),
      {
        kind: 'patch_duration',
        projectId: PROBE.projectId,
        wpId: leaf.id,
        durationDays: 0,
      },
    );
    expect(stayZero.ok).toBe(true);
    expect(await loadWp(app, leaf.id)).toEqual({ isMilestone: true, durationDays: 0 });
  });

  it('patch_milestone true on a multi-day WP coerces duration to 0', async () => {
    const owner = getDb(OWNER_DATABASE_URL!);
    const app = getDb(APP_DATABASE_URL!);
    const leaf = await prepareSchedulableProject(owner);
    expect(await loadWp(app, leaf.id)).toMatchObject({ durationDays: 3 });

    const result = await applyPlanChange(
      { handle: app, transaction: inTenantTransaction },
      ctx(),
      {
        kind: 'patch_milestone',
        projectId: PROBE.projectId,
        wpId: leaf.id,
        isMilestone: true,
      },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(await loadWp(app, leaf.id)).toEqual({ isMilestone: true, durationDays: 0 });
  });

  it('patch_milestone false clears flag and sets durationDays to null (Q1→C)', async () => {
    const owner = getDb(OWNER_DATABASE_URL!);
    const app = getDb(APP_DATABASE_URL!);
    const leaf = await prepareSchedulableProject(owner);

    const marked = await applyPlanChange(
      { handle: app, transaction: inTenantTransaction },
      ctx(),
      {
        kind: 'patch_milestone',
        projectId: PROBE.projectId,
        wpId: leaf.id,
        isMilestone: true,
      },
    );
    expect(marked.ok).toBe(true);
    if (!marked.ok) return;

    const cleared = await applyPlanChange(
      { handle: app, transaction: inTenantTransaction },
      ctx(),
      {
        kind: 'patch_milestone',
        projectId: PROBE.projectId,
        wpId: leaf.id,
        isMilestone: false,
      },
    );
    expect(cleared.ok).toBe(true);
    if (!cleared.ok) return;

    expect(await loadWp(app, leaf.id)).toEqual({ isMilestone: false, durationDays: null });
  });
});
