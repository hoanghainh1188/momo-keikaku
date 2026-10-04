/**
 * Story 4.5 — Baseline compare Plan-grid columns: happy Δ after plan edit, no-Baseline
 * disable contract, Divergence pin sources, summary N/A, role reach unchanged.
 */
import { describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import {
  divergenceFromPinned,
  parseStoredInputs,
  parseStoredOutputs,
} from '@momo/domain';
import { setBaseline } from '../../packages/app/src/baseline/set-baseline';
import { getPlanGridState } from '../../packages/app/src/schedule/plan-grid';
import { applyPlanChange } from '../../packages/app/src/schedule/apply-plan-change';
import { getDb } from '../../packages/db/src/client';
import {
  assertProbeTenantsDisjoint,
  buildProbeTenant,
} from '../../packages/db/src/probe-tenants';
import { baselineRepositoryOn } from '../../packages/db/src/repositories/baseline';
import { scheduleRepositoryOn } from '../../packages/db/src/repositories/schedule';
import * as s from '../../packages/db/src/schema';
import { inTenantTransaction } from '../../packages/db/src/tenant-transaction';
import { withTenant } from '../../packages/db/src/with-tenant';
import {
  connectFenceHarness,
  installFenceAfterAll,
  makeAllLeavesSchedulable,
  pmCtx,
  prepareSchedulableLeaf,
  scheduleLeaf,
} from './fence-harness';

const OWNER_DATABASE_URL = process.env.DATABASE_URL;
const APP_DATABASE_URL = process.env.APP_DATABASE_URL;

const { reachable } = await connectFenceHarness({
  ownerUrl: OWNER_DATABASE_URL,
  appUrl: APP_DATABASE_URL,
  requireDb: process.env.REQUIRE_DB === '1',
});

const PROBE = buildProbeTenant('xtprobe-s45', 961_000_000);
assertProbeTenantsDisjoint([PROBE]);
await installFenceAfterAll({ reachable, ownerUrl: OWNER_DATABASE_URL, probe: PROBE });

const ctx = () => pmCtx(PROBE, { userId: 'user-s45' });
const deps = () => ({
  handle: getDb(APP_DATABASE_URL!),
  transaction: inTenantTransaction,
  ids: {
    next: (() => {
      let n = 0;
      return () => `bl-s45-${++n}`;
    })(),
  },
});

describe.skipIf(!reachable)('Baseline compare Plan grid (story 4.5)', () => {
  it('no Baseline: hasBaseline false; Schedule rows still load (UX-DR23)', async () => {
    const owner = getDb(OWNER_DATABASE_URL!);
    await prepareSchedulableLeaf(owner, PROBE);
    await makeAllLeavesSchedulable(owner, PROBE);
    await scheduleLeaf(deps(), ctx(), PROBE.projectId, PROBE.state.wps.find((w) => w.isLeaf && !w.isMilestone)!.id);

    const grid = await getPlanGridState(deps(), ctx(), { projectId: PROBE.projectId });
    expect(grid.ok).toBe(true);
    if (!grid.ok) return;
    expect(grid.value.hasBaseline).toBe(false);
    expect(grid.value.rows.length).toBeGreaterThan(0);
    for (const row of grid.value.rows) {
      expect(row.baselineStart).toBeNull();
      expect(row.baselineMh).toBeNull();
    }
  });

  it('happy path: after Set + duration edit, Baseline compare Δ is non-zero on the leaf', async () => {
    const owner = getDb(OWNER_DATABASE_URL!);
    const leaf = await prepareSchedulableLeaf(owner, PROBE);
    await makeAllLeavesSchedulable(owner, PROBE);
    await scheduleLeaf(deps(), ctx(), PROBE.projectId, leaf.id, 5);

    const set = await setBaseline(deps(), ctx(), { projectId: PROBE.projectId });
    expect(set.ok).toBe(true);
    if (!set.ok) {
      expect.fail(`setBaseline failed: ${set.error.code} ${JSON.stringify(set.error.details)}`);
    }

    // Pin Baseline effort, then move Current Plan effort + duration so Δs are non-zero.
    const before = await getPlanGridState(deps(), ctx(), { projectId: PROBE.projectId });
    expect(before.ok).toBe(true);
    if (!before.ok) return;
    const baselineMhAtSet = before.value.rows.find((r) => r.wpId === leaf.id)?.baselineMh;
    expect(baselineMhAtSet).not.toBeNull();
    const nextPlannedMh = (baselineMhAtSet ?? 0n) + 8_000n;
    const effort = await applyPlanChange(deps(), ctx(), {
      kind: 'patch_effort',
      projectId: PROBE.projectId,
      wpId: leaf.id,
      plannedMh: nextPlannedMh,
    });
    expect(effort.ok).toBe(true);
    await scheduleLeaf(deps(), ctx(), PROBE.projectId, leaf.id, 8);

    const grid = await getPlanGridState(deps(), ctx(), { projectId: PROBE.projectId });
    expect(grid.ok).toBe(true);
    if (!grid.ok) return;
    expect(grid.value.hasBaseline).toBe(true);

    const leafRow = grid.value.rows.find((r) => r.wpId === leaf.id);
    expect(leafRow).toBeDefined();
    expect(leafRow!.isLeaf).toBe(true);
    expect(leafRow!.baselineStart).not.toBeNull();
    expect(leafRow!.baselineFinish).not.toBeNull();
    expect(leafRow!.baselineDurationDays).toBe(5);
    expect(leafRow!.durationDays).toBe(8);
    expect(leafRow!.durationDeltaDays).toBe(3);
    // Effort pinned independently of duration Δ.
    expect(leafRow!.baselineMh).toBe(baselineMhAtSet);
    expect(leafRow!.plannedMh).toBe(nextPlannedMh);
    expect(leafRow!.effortDeltaMh).toBe(8_000n);
    // Date Δ independent of durationDeltaDays assertion (finish moves with longer duration).
    expect(
      leafRow!.startDeltaDays !== 0 || leafRow!.finishDeltaDays !== 0,
    ).toBe(true);

    const summary = grid.value.rows.find((r) => !r.isLeaf);
    if (summary !== undefined) {
      expect(summary.baselineStart).toBeNull();
      expect(summary.baselineFinish).toBeNull();
      expect(summary.baselineDurationDays).toBeNull();
      expect(summary.baselineMh).toBeNull();
    }
  });

  it('Divergence reads pin outputs/inputs only (AR-22), never Current Plan columns', async () => {
    const owner = getDb(OWNER_DATABASE_URL!);
    const leaf = await prepareSchedulableLeaf(owner, PROBE);
    await makeAllLeavesSchedulable(owner, PROBE);
    await scheduleLeaf(deps(), ctx(), PROBE.projectId, leaf.id, 4);
    const set = await setBaseline(deps(), ctx(), { projectId: PROBE.projectId });
    expect(set.ok).toBe(true);

    // Mutate Current Plan after pin — Divergence must still use the pin.
    await scheduleLeaf(deps(), ctx(), PROBE.projectId, leaf.id, 9);

    await withTenant(getDb(APP_DATABASE_URL!), PROBE.tenantId, async (tx) => {
      const bound = { tx, tenantId: PROBE.tenantId };
      const baseline = baselineRepositoryOn(bound);
      const schedule = scheduleRepositoryOn(bound);
      const pinSeq = await baseline.latestPinnedScheduleRunSeq(PROBE.projectId);
      expect(pinSeq).not.toBeNull();
      const wps = await baseline.loadActiveBaselineWps(PROBE.projectId);
      const run = await schedule.runBySeq(PROBE.projectId, pinSeq!);
      expect(run).not.toBeNull();
      const inputs = parseStoredInputs(run!.inputs);
      const outputs = parseStoredOutputs(run!.outputs!);
      const rows = divergenceFromPinned({
        baselineWps: wps,
        pinnedInputs: inputs,
        pinnedOutputs: outputs,
      });
      const leafDiv = rows.find((r) => r.wpId === leaf.id);
      expect(leafDiv).toBeDefined();
      // Pin still has duration 4; Current Plan is 9 — Divergence pin duration stays 4.
      expect(leafDiv!.pinDurationDays).toBe(4);
      expect(leafDiv!.pinEarlyStart).not.toBeNull();
      expect(leafDiv!.pinPlannedMh).not.toBeNull();
    });
  });

  it('viewer without project reach gets not_found', async () => {
    const owner = getDb(OWNER_DATABASE_URL!);
    await prepareSchedulableLeaf(owner, PROBE);
    const viewer = pmCtx(PROBE, {
      userId: 'viewer-s45',
      roles: ['client_viewer'],
      projectIds: [],
    });
    const grid = await getPlanGridState(deps(), viewer, { projectId: PROBE.projectId });
    expect(grid.ok).toBe(false);
    if (grid.ok) return;
    expect(grid.error.code).toBe('not_found');
  });
});
