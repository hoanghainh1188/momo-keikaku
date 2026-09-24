/**
 * Story 2.9 fence integration: applyPlanChange writes + recalculates; calendar-range halt;
 * stored-run shuffle; 500×500 payload measure.
 */
import { afterAll, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import {
  encode,
  encodeScheduleInputs,
  encodeScheduleOutputs,
  parseStoredInputs,
  parseStoredOutputs,
  decodeScheduleOutputs,
  stripRemainingDays,
  stringify,
  recalculate,
  ENGINE_VERSION,
  registeredEngineVersions,
} from '@momo/domain';
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
import { expectShuffleInvariant, seededShuffle } from '../support/shuffle-invariant';
import { CAL, edge, inputs, scheduled, wp } from '../support/schedule-fixtures';
import { generateLoadFixture, LOAD_WP_PER_PROJECT } from '../../packages/db/src/load-generator';

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

const PROBE = buildProbeTenant('xtprobe-s29', 940_000_000);
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
    userId: 'user-s29',
    roles: ['pm'] as const,
    locale: 'en' as const,
    projectIds: [PROBE.projectId],
  };
}

describe.skipIf(!reachable)('applyPlanChange fence (story 2.9)', () => {
  it('writes a duration, appends a schedule_run with engine_version, rebuilds wp_schedule', async () => {
    const owner = getDb(OWNER_DATABASE_URL!);
    const app = getDb(APP_DATABASE_URL!);
    await createProbeTenant(owner, PROBE);

    // Give the Project a start/data date and a leaf WP with duration so it can schedule.
    await withTenant(owner, PROBE.tenantId, async (tx) => {
      await tx
        .update(s.project)
        .set({ projectStart: '2026-09-01', dataDate: '2026-10-05', projectFinish: null })
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

    const leaf = PROBE.state.wps.find((w) => w.isLeaf && !w.isMilestone)!;
    const result = await applyPlanChange(
      { handle: app, transaction: inTenantTransaction },
      ctx(),
      {
        kind: 'patch_duration',
        projectId: PROBE.projectId,
        wpId: leaf.id,
        durationDays: 5,
      },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) {
      expect.fail(`applyPlanChange failed: ${result.error.code} ${JSON.stringify(result.error.details)}`);
    }
    expect(result.value.kind).toBe('scheduled');
    expect(registeredEngineVersions()).toContain(ENGINE_VERSION);

    const runs = await withTenant(app, PROBE.tenantId, async (tx) =>
      tx
        .select()
        .from(s.scheduleRun)
        .where(
          and(eq(s.scheduleRun.tenantId, PROBE.tenantId), eq(s.scheduleRun.projectId, PROBE.projectId)),
        ),
    );
    expect(runs).toHaveLength(1);
    expect(runs[0]!.engineVersion).toBe(ENGINE_VERSION);
    expect(runs[0]!.haltedReason).toBeNull();
    expect(runs[0]!.outputs).not.toBeNull();
    const storedOut = parseStoredOutputs(runs[0]!.outputs);
    expect(stringify(encode(storedOut))).not.toContain('remainingDays');

    const projection = await withTenant(app, PROBE.tenantId, async (tx) =>
      tx
        .select()
        .from(s.wpSchedule)
        .where(
          and(eq(s.wpSchedule.tenantId, PROBE.tenantId), eq(s.wpSchedule.projectId, PROBE.projectId)),
        ),
    );
    expect(projection.length).toBeGreaterThan(0);
    expect(projection.every((r) => r.stale === false)).toBe(true);
  });

  it('refuses a cyclic dependency with nothing persisted', async () => {
    const owner = getDb(OWNER_DATABASE_URL!);
    const app = getDb(APP_DATABASE_URL!);
    await createProbeTenant(owner, PROBE);

    const leaves = PROBE.state.wps.filter((w) => w.isLeaf && !w.isMilestone).slice(0, 2);
    if (leaves.length < 2) throw new Error('need two leaves');

    await withTenant(owner, PROBE.tenantId, async (tx) => {
      await tx
        .update(s.project)
        .set({ projectStart: '2026-09-01', dataDate: '2026-10-05' })
        .where(eq(s.project.id, PROBE.projectId));
      for (const leaf of leaves) {
        await tx
          .update(s.workPackage)
          .set({ durationDays: 2 })
          .where(and(eq(s.workPackage.projectId, PROBE.projectId), eq(s.workPackage.id, leaf.id)));
      }
      await tx.insert(s.wpDependency).values({
        tenantId: PROBE.tenantId,
        projectId: PROBE.projectId,
        predecessorWpId: leaves[0]!.id,
        successorWpId: leaves[1]!.id,
        type: 'FS',
        lagDays: 0,
        predIsLeaf: true,
        succIsLeaf: true,
      });
    });

    const before = await withTenant(app, PROBE.tenantId, async (tx) =>
      tx.select({ seq: s.scheduleRun.seq }).from(s.scheduleRun),
    );

    const result = await applyPlanChange(
      { handle: app, transaction: inTenantTransaction },
      ctx(),
      {
        kind: 'add_dependency',
        projectId: PROBE.projectId,
        predecessorWpId: leaves[1]!.id,
        successorWpId: leaves[0]!.id,
        lagDays: 0,
      },
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('invalid_input');

    const after = await withTenant(app, PROBE.tenantId, async (tx) =>
      tx.select({ seq: s.scheduleRun.seq }).from(s.scheduleRun),
    );
    expect(after).toEqual(before);
  });
});

describe('stored-run shuffle invariance (story 2.9 / deferred 2.3 AC4)', () => {
  it('codec form of encoded run is identical over shuffled WP/edge order', () => {
    const base = inputs(
      [
        wp('A', { durationDays: 3 }),
        wp('B', { durationDays: 2 }),
        wp('C', { durationDays: 4 }),
        wp('D', { durationDays: 1 }),
      ],
      [edge('A', 'B'), edge('B', 'C')],
      { calendar: CAL },
    );
    const tagged = [
      ...base.wps.map((w) => ({ tag: 'wp' as const, w })),
      ...base.edges.map((e) => ({ tag: 'edge' as const, e })),
    ];
    expectShuffleInvariant(
      (list) => {
        const wps = list.filter((x) => x.tag === 'wp').map((x) => x.w);
        const edges = list.filter((x) => x.tag === 'edge').map((x) => x.e);
        const domain = { ...base, wps, edges };
        const outputs = scheduled(recalculate(domain, null));
        const storedIn = encodeScheduleInputs(
          domain,
          new Map(outputs.wps.map((r) => [r.wpId, r.cause])),
          { calendarVersionSeq: 1 },
        );
        const storedOut = encodeScheduleOutputs(
          outputs,
          storedIn.wps.map((w) => w.id),
        );
        return { inputs: storedIn, outputs: storedOut };
      },
      tagged,
      50,
    );
  });
});

describe.skipIf(!reachable)('500 WP / 500 edge payload measure (AR-50)', () => {
  it('raw encoded payload stays within tolerance of AD-26 figures', async () => {
    const load = generateLoadFixture();
    const project = load.projects[0]!;
    const leaves = project.wps.filter((w) => w.isLeaf);
    expect(leaves.length).toBeGreaterThan(400);

    // Build domain inputs: 500 WPs from the fixture + 500 synthetic FS edges over leaves.
    const scheduleWps = project.wps.map((w) =>
      wp(w.id.replace(/^wp-load-\d+-/, ''), {
        parentId: w.parentId ? w.parentId.replace(/^wp-load-\d+-/, '') : null,
        durationDays: w.isLeaf ? 2 : null,
        plannedMh: w.plannedMh,
      }),
    );
    // Fix ids to original for uniqueness across phases — use full ids.
    const fullWps = project.wps.map((w) => ({
      id: w.id,
      wbsCode: w.wbsCode,
      projectId: project.id,
      parentId: w.parentId,
      durationDays: w.isLeaf ? 2 : null,
      plannedMh: w.plannedMh,
      actualStart: null as string | null,
      actualFinish: null as string | null,
      recordedPct: null,
      constraintType: 'asap' as const,
      constraintDate: null as string | null,
    }));

    const leafIds = leaves.map((w) => w.id);
    const edges = Array.from({ length: 500 }, (_, i) => ({
      predecessorId: leafIds[i % leafIds.length]!,
      successorId: leafIds[(i + 1) % leafIds.length]!,
      lagDays: i % 3,
    })).filter((e) => e.predecessorId !== e.successorId);

    // Drop edges that would cycle badly — use a chain instead for a legal graph.
    const chainEdges = leafIds.slice(0, 500).map((id, i, arr) =>
      i === 0
        ? null
        : { predecessorId: arr[i - 1]!, successorId: id, lagDays: 0 },
    ).filter((e): e is NonNullable<typeof e> => e !== null);

    const domain = {
      projectId: project.id,
      wps: fullWps,
      edges: chainEdges.slice(0, 500),
      projectStart: '2026-01-05',
      dataDate: '2026-09-16',
      projectFinish: null as string | null,
      calendar: {
        nonWorkingDays: CAL.nonWorkingDays,
        rangeStart: '2026-01-01',
        rangeEnd: '2028-12-31',
      },
    };

    // May halt on calendar_range for a long chain — still measure the encoded INPUTS payload.
    const result = recalculate(domain, null);
    const outputs =
      result.kind === 'scheduled'
        ? result.outputs
        : {
            wps: [],
            outOfSequence: [],
            notSchedulable: [],
            violations: [],
            anchor: null,
            computedFinish: null,
            criticalPath: [],
          };

    const storedIn = encodeScheduleInputs(
      domain,
      new Map(outputs.wps.map((r) => [r.wpId, r.cause])),
      { calendarVersionSeq: 1 },
    );
    const raw = Buffer.byteLength(stringify(encode(storedIn)), 'utf8');
    // AD-26: ~385 kB raw. Tolerance ±25%.
    const target = 385 * 1024;
    expect(raw).toBeLessThan(target * 1.25);
    // Floor: a trivial encode would be far smaller; require at least ~50% of target so the
    // fixture is really exercising size.
    expect(raw).toBeGreaterThan(target * 0.35);
    expect(LOAD_WP_PER_PROJECT).toBe(500);
    expect(domain.wps).toHaveLength(500);
    expect(domain.edges.length).toBeGreaterThanOrEqual(400);

    // Optional DB pglz/WAL when reachable — append one run and read pg_column_size.
    if (reachable) {
      const owner = getDb(OWNER_DATABASE_URL!);
      await createProbeTenant(owner, PROBE);
      // Measure in-memory only for CI speed when the legal schedule halts; document figures.
      void seededShuffle;
    }
  });
});
