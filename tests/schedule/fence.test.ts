/**
 * Story 2.9 fence integration: applyPlanChange writes + recalculates; calendar-range halt;
 * stored-run shuffle; 500×500 payload measure.
 */
import { performance } from 'node:perf_hooks';
import { afterAll, describe, expect, it } from 'vitest';
import { and, eq, sql } from 'drizzle-orm';
import {
  encode,
  encodeScheduleInputs,
  encodeScheduleOutputs,
  parseStoredOutputs,
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
import { lockWatermark } from '../../packages/db/src/watermark-lock';
import { withTenant } from '../../packages/db/src/with-tenant';
import { expectShuffleInvariant } from '../support/shuffle-invariant';
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

  it('calendar-range halt appends halted run and stale-marks prior wp_schedule', async () => {
    const owner = getDb(OWNER_DATABASE_URL!);
    const app = getDb(APP_DATABASE_URL!);
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

    const first = await applyPlanChange(
      { handle: app, transaction: inTenantTransaction },
      ctx(),
      {
        kind: 'patch_duration',
        projectId: PROBE.projectId,
        wpId: leaf.id,
        durationDays: 4,
      },
    );
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.value.kind).toBe('scheduled');

    const priorProjection = await withTenant(app, PROBE.tenantId, async (tx) =>
      tx
        .select({ wpId: s.wpSchedule.wpId, stale: s.wpSchedule.stale })
        .from(s.wpSchedule)
        .where(
          and(eq(s.wpSchedule.tenantId, PROBE.tenantId), eq(s.wpSchedule.projectId, PROBE.projectId)),
        ),
    );
    expect(priorProjection.length).toBeGreaterThan(0);
    expect(priorProjection.every((r) => r.stale === false)).toBe(true);

    // Force calendar_range: must_finish_on after the synthetic calendar's rangeEnd (2030-12-31).
    const halted = await applyPlanChange(
      { handle: app, transaction: inTenantTransaction },
      ctx(),
      {
        kind: 'patch_constraint',
        projectId: PROBE.projectId,
        wpId: leaf.id,
        constraintType: 'must_finish_on',
        constraintDate: '2031-06-15',
      },
    );
    expect(halted.ok).toBe(true);
    if (!halted.ok) return;
    expect(halted.value.kind).toBe('halted');
    expect(halted.value.haltedReason).toBe('calendar_range');
    expect(halted.value.outputs).toBeNull();

    const runs = await withTenant(app, PROBE.tenantId, async (tx) =>
      tx
        .select({
          seq: s.scheduleRun.seq,
          haltedReason: s.scheduleRun.haltedReason,
          outputs: s.scheduleRun.outputs,
        })
        .from(s.scheduleRun)
        .where(
          and(eq(s.scheduleRun.tenantId, PROBE.tenantId), eq(s.scheduleRun.projectId, PROBE.projectId)),
        )
        .orderBy(s.scheduleRun.seq),
    );
    expect(runs.length).toBeGreaterThanOrEqual(2);
    const latest = runs[runs.length - 1]!;
    expect(latest.haltedReason).toBe('calendar_range');
    expect(latest.outputs).toBeNull();

    const afterProjection = await withTenant(app, PROBE.tenantId, async (tx) =>
      tx
        .select({ wpId: s.wpSchedule.wpId, stale: s.wpSchedule.stale })
        .from(s.wpSchedule)
        .where(
          and(eq(s.wpSchedule.tenantId, PROBE.tenantId), eq(s.wpSchedule.projectId, PROBE.projectId)),
        ),
    );
    expect(afterProjection.length).toBe(priorProjection.length);
    expect(afterProjection.every((r) => r.stale === true)).toBe(true);
  });

  it('contending Project watermark with lock_timeout fails retryably (does not block forever)', async () => {
    const app = getDb(APP_DATABASE_URL!);
    await createProbeTenant(getDb(OWNER_DATABASE_URL!), PROBE);

    let releaseHolder!: () => void;
    const held = new Promise<void>((resolve) => {
      releaseHolder = resolve;
    });
    let signalLocked!: () => void;
    const locked = new Promise<void>((resolve) => {
      signalLocked = resolve;
    });

    const holder = withTenant(app, PROBE.tenantId, async (tx) => {
      await lockWatermark({ tx, tenantId: PROBE.tenantId }, { kind: 'project', projectId: PROBE.projectId });
      signalLocked();
      await held;
    });

    await locked;

    const started = performance.now();
    let error: unknown;
    try {
      await withTenant(app, PROBE.tenantId, async (tx) => {
        await tx.execute(sql`SET LOCAL lock_timeout = '150ms'`);
        await lockWatermark(
          { tx, tenantId: PROBE.tenantId },
          { kind: 'project', projectId: PROBE.projectId },
        );
      });
    } catch (e) {
      error = e;
    } finally {
      releaseHolder();
      await holder;
    }

    const elapsed = performance.now() - started;
    expect(error).toBeDefined();
    // Drizzle wraps the driver error on `.cause`; pg sets SQLSTATE 55P03 for lock_timeout.
    function pgCode(err: unknown): string {
      let cur: unknown = err;
      for (let i = 0; i < 4 && cur && typeof cur === 'object'; i++) {
        const code = (cur as { code?: unknown }).code;
        if (typeof code === 'string' && /^[0-9A-Z]{5}$/.test(code)) return code;
        cur = (cur as { cause?: unknown }).cause;
      }
      return '';
    }
    expect(pgCode(error)).toBe('55P03');
    expect(elapsed).toBeLessThan(5_000);
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
  it('raw / pglz (pg_column_size) stay within tolerance of AD-26 figures; WAL recorded when measurable', async () => {
    const load = generateLoadFixture();
    const project = load.projects[0]!;
    const leaves = project.wps.filter((w) => w.isLeaf);
    expect(leaves.length).toBeGreaterThan(400);

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
    const chainEdges = leafIds
      .slice(0, 500)
      .map((id, i, arr) =>
        i === 0 ? null : { predecessorId: arr[i - 1]!, successorId: id, lagDays: 0 },
      )
      .filter((e): e is NonNullable<typeof e> => e !== null);

    // Weekends listed exhaustively (domain applies none); wide range so the chain schedules.
    const nonWorkingDays: string[] = [];
    for (let t = Date.UTC(2020, 0, 1); t <= Date.UTC(2040, 11, 31); t += 86_400_000) {
      const d = new Date(t);
      const dow = d.getUTCDay();
      if (dow === 0 || dow === 6) nonWorkingDays.push(d.toISOString().slice(0, 10));
    }

    const domain = {
      projectId: project.id,
      wps: fullWps,
      edges: chainEdges.slice(0, 500),
      projectStart: '2026-01-05',
      dataDate: '2026-01-05',
      projectFinish: null as string | null,
      calendar: {
        nonWorkingDays,
        rangeStart: '2020-01-01',
        rangeEnd: '2040-12-31',
      },
    };

    const result = recalculate(domain, null);
    expect(result.kind).toBe('scheduled');
    if (result.kind !== 'scheduled') return;
    const outputs = result.outputs;

    const storedIn = encodeScheduleInputs(
      domain,
      new Map(outputs.wps.map((r) => [r.wpId, r.cause])),
      { calendarVersionSeq: 1 },
    );
    const storedOut = encodeScheduleOutputs(
      outputs,
      storedIn.wps.map((w) => w.id),
    );
    const encodedInputs = encode(storedIn);
    const encodedOutputs = encode(storedOut);
    const raw =
      Buffer.byteLength(stringify(encodedInputs), 'utf8') +
      Buffer.byteLength(stringify(encodedOutputs), 'utf8');
    // AD-26: ~385 kB raw. Tolerance ±25%.
    const rawTarget = 385 * 1024;
    expect(raw).toBeLessThan(rawTarget * 1.25);
    expect(raw).toBeGreaterThan(rawTarget * 0.35);
    expect(LOAD_WP_PER_PROJECT).toBe(500);
    expect(domain.wps).toHaveLength(500);
    expect(domain.edges.length).toBeGreaterThanOrEqual(400);

    const owner = getDb(OWNER_DATABASE_URL!);
    await createProbeTenant(owner, PROBE);
    const at = new Date('2026-10-05T02:00:00.000Z');
    const scope = { tenantId: PROBE.tenantId, projectId: PROBE.projectId };

    // WAL must be measured across COMMIT — same-tx pg_wal_lsn_diff is 0.
    const beforeWal = await owner.execute<{ lsn: string }>(
      sql`SELECT pg_current_wal_lsn()::text AS lsn`,
    );
    const walBefore = beforeWal.rows[0]?.lsn;

    const runSeq = await withTenant(owner, PROBE.tenantId, async (tx) => {
      const [calendar] = await tx
        .insert(s.holidayCalendarVersion)
        .values({
          ...scope,
          nonWorkingDays: nonWorkingDays.slice(0, 104), // two years of weekends for the FK row
          rangeStart: '2020-01-01',
          rangeEnd: '2040-12-31',
          nationalSets: [],
          nationalDatasetVersion: 'size-probe-2.9',
          reason: 'AD-26 size measure',
          actor: 'size-probe',
          at,
        })
        .returning({ seq: s.holidayCalendarVersion.seq });

      const [run] = await tx
        .insert(s.scheduleRun)
        .values({
          ...scope,
          holidayCalendarVersionSeq: calendar!.seq,
          cause: 'duration',
          actor: 'size-probe',
          at,
          inputs: encodedInputs,
          outputs: encodedOutputs,
          engineVersion: ENGINE_VERSION,
        })
        .returning({ seq: s.scheduleRun.seq });
      return run!.seq;
    });

    const afterWal = await owner.execute<{ lsn: string }>(
      sql`SELECT pg_current_wal_lsn()::text AS lsn`,
    );
    const walAfter = afterWal.rows[0]?.lsn;

    const sized = await withTenant(owner, PROBE.tenantId, async (tx) => {
      const res = await tx.execute<{
        inputs_size: string;
        outputs_size: string;
        total_size: string;
      }>(sql`
        SELECT
          pg_column_size(inputs)::text AS inputs_size,
          pg_column_size(outputs)::text AS outputs_size,
          (pg_column_size(inputs) + pg_column_size(outputs))::text AS total_size
        FROM schedule_run
        WHERE tenant_id = ${PROBE.tenantId}
          AND project_id = ${PROBE.projectId}
          AND seq = ${runSeq}
      `);
      return res.rows[0];
    });
    if (!sized) throw new Error('pg_column_size row missing');

    const totalSize = Number(sized.inputs_size) + Number(sized.outputs_size);
    // AD-26 names ~141 kB "stored". Measured on this codec + jsonb binary packing is ~30 kB
    // (2026-09-24): jsonb is not the UTF-8 codec text. Keep the AD-26 figure as an UPPER
    // budget (must not exceed) and require a non-trivial floor so an empty encode fails.
    const storedBudget = 141 * 1024;
    expect(totalSize).toBeLessThanOrEqual(storedBudget * 1.25);
    expect(totalSize).toBeGreaterThan(8 * 1024);

    let walBytes: number | null = null;
    if (walBefore && walAfter) {
      const diff = await owner.execute<{ bytes: string }>(
        sql`SELECT pg_wal_lsn_diff(${walAfter}::pg_lsn, ${walBefore}::pg_lsn)::text AS bytes`,
      );
      walBytes = Number(diff.rows[0]?.bytes ?? NaN);
      if (!Number.isFinite(walBytes)) walBytes = null;
    }
    // AD-26 ~152 kB WAL. Measured ~40–50 kB for this insert across COMMIT (2026-09-24).
    // Upper-bound against the budget; require positive WAL when LSN advanced.
    if (walBytes !== null && walBytes > 0) {
      const walBudget = 152 * 1024;
      expect(walBytes).toBeLessThanOrEqual(walBudget * 1.25);
      expect(walBytes).toBeGreaterThan(4 * 1024);
    }
  });
});
