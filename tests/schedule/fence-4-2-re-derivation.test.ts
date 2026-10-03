/**
 * Story 4.2 — re-derivation fence: setBaseline → re-derive pin; mutate Current Plan after
 * pin and assert the pin still green (never reads live plan / latest run for gate inputs).
 */
import { describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { applyPlanChange } from '../../packages/app/src/schedule/apply-plan-change';
import { setBaseline } from '../../packages/app/src/baseline/set-baseline';
import { reDerivePinnedBaseline } from '../../packages/app/src/baseline/re-derive-pinned';
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

// Keep below seed-sequences.test.ts's high water (960_000_500) and clear of 4.1's 959M band.
const PROBE = buildProbeTenant('xtprobe-s42', 942_000_000);
assertProbeTenantsDisjoint([PROBE]);
await installFenceAfterAll({ reachable, ownerUrl: OWNER_DATABASE_URL, probe: PROBE });

const ctx = () => pmCtx(PROBE, { userId: 'user-s42' });
const deps = () => ({
  handle: getDb(APP_DATABASE_URL!),
  transaction: inTenantTransaction,
  ids: {
    next: (() => {
      let n = 0;
      return () => `bl-s42-${++n}`;
    })(),
  },
});

/** Give every non-milestone leaf a duration so Set Baseline is not refused for incompleteness. */
async function makeAllLeavesSchedulable(owner: ReturnType<typeof getDb>) {
  const leaves = PROBE.state.wps.filter((w) => w.isLeaf && !w.isMilestone);
  await withTenant(owner, PROBE.tenantId, async (tx) => {
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
    for (const m of PROBE.state.wps.filter((w) => w.isLeaf && w.isMilestone)) {
      await tx
        .update(s.workPackage)
        .set({ durationDays: 0, isMilestone: true })
        .where(
          and(
            eq(s.workPackage.tenantId, PROBE.tenantId),
            eq(s.workPackage.projectId, PROBE.projectId),
            eq(s.workPackage.id, m.id),
          ),
        );
    }
  });
}

async function scheduleLeaf(leafId: string, durationDays: number) {
  const result = await applyPlanChange(deps(), ctx(), {
    kind: 'patch_duration',
    projectId: PROBE.projectId,
    wpId: leafId,
    durationDays,
  });
  expect(result.ok).toBe(true);
  if (!result.ok) {
    expect.fail(`schedule failed: ${result.error.code} ${JSON.stringify(result.error.details)}`);
  }
  expect(result.value.kind).toBe('scheduled');
  return result.value.seq!;
}

describe.skipIf(!reachable)('re-derivation fence (story 4.2)', () => {
  it('setBaseline pin re-derives green with null prev (first successful run)', async () => {
    const owner = getDb(OWNER_DATABASE_URL!);
    const leaf = await prepareSchedulableLeaf(owner, PROBE);
    await makeAllLeavesSchedulable(owner);
    const runSeq = await scheduleLeaf(leaf.id, 5);

    const set = await setBaseline(deps(), ctx(), { projectId: PROBE.projectId });
    expect(set.ok).toBe(true);
    if (!set.ok) return;
    expect(set.value.scheduleRunSeq).toBe(runSeq);

    const derived = await reDerivePinnedBaseline(deps(), ctx(), { projectId: PROBE.projectId });
    expect(derived.ok).toBe(true);
    if (!derived.ok) {
      expect.fail(`re-derive failed: ${derived.error.code} ${JSON.stringify(derived.error.details)}`);
    }
    expect(derived.value.pinnedScheduleRunSeq).toBe(runSeq);
    expect(derived.value.prevRunSeq).toBeNull();
    expect(derived.value.gate).toEqual({ ok: true });
  });

  it('after pin, mutating Current Plan (newer run) still re-derives the pin green', async () => {
    const owner = getDb(OWNER_DATABASE_URL!);
    const leaf = await prepareSchedulableLeaf(owner, PROBE);
    await makeAllLeavesSchedulable(owner);
    const pinnedSeq = await scheduleLeaf(leaf.id, 5);

    const set = await setBaseline(deps(), ctx(), { projectId: PROBE.projectId });
    expect(set.ok).toBe(true);
    if (!set.ok) return;
    expect(set.value.scheduleRunSeq).toBe(pinnedSeq);

    // Mutate the live plan — appends a newer successful run (Current Plan moves).
    const newerSeq = await scheduleLeaf(leaf.id, 9);
    expect(newerSeq).toBeGreaterThan(pinnedSeq);

    const { latestSeq, pinSeq } = await withTenant(
      getDb(APP_DATABASE_URL!),
      PROBE.tenantId,
      async (tx) => {
        const bound = { tx, tenantId: PROBE.tenantId };
        const latest = await scheduleRepositoryOn(bound).latestRun(PROBE.projectId);
        const pin = await baselineRepositoryOn(bound).latestPinnedScheduleRunSeq(PROBE.projectId);
        return { latestSeq: latest?.seq ?? null, pinSeq: pin };
      },
    );
    expect(latestSeq).toBe(newerSeq);
    expect(pinSeq).toBe(pinnedSeq);
    expect(pinSeq).not.toBe(latestSeq);

    const derived = await reDerivePinnedBaseline(deps(), ctx(), { projectId: PROBE.projectId });
    expect(derived.ok).toBe(true);
    if (!derived.ok) {
      expect.fail(`re-derive failed: ${derived.error.code} ${JSON.stringify(derived.error.details)}`);
    }
    // Gate reads the pin FK, not Current Plan head.
    expect(derived.value.pinnedScheduleRunSeq).toBe(pinnedSeq);
    expect(derived.value.pinnedScheduleRunSeq).not.toBe(newerSeq);
    expect(derived.value.gate).toEqual({ ok: true });
  });

  it('with-prev pin: second successful run pinned via first Set after two schedules', async () => {
    // First Set pins the latest successful run. Two schedule writes → pin has prev_run_seq.
    // (setBaseline refuses a second Set; we pin the second run by scheduling twice then Set once.)
    const owner = getDb(OWNER_DATABASE_URL!);
    const leaf = await prepareSchedulableLeaf(owner, PROBE);
    await makeAllLeavesSchedulable(owner);
    const firstSeq = await scheduleLeaf(leaf.id, 4);
    const secondSeq = await scheduleLeaf(leaf.id, 7);
    expect(secondSeq).toBeGreaterThan(firstSeq);

    const set = await setBaseline(deps(), ctx(), { projectId: PROBE.projectId });
    expect(set.ok).toBe(true);
    if (!set.ok) return;
    expect(set.value.scheduleRunSeq).toBe(secondSeq);

    const derived = await reDerivePinnedBaseline(deps(), ctx(), { projectId: PROBE.projectId });
    expect(derived.ok).toBe(true);
    if (!derived.ok) {
      expect.fail(`re-derive failed: ${derived.error.code} ${JSON.stringify(derived.error.details)}`);
    }
    expect(derived.value.pinnedScheduleRunSeq).toBe(secondSeq);
    expect(derived.value.prevRunSeq).toBe(firstSeq);
    expect(derived.value.gate).toEqual({ ok: true });
  });

  it('refuses when no Baseline exists', async () => {
    const owner = getDb(OWNER_DATABASE_URL!);
    const leaf = await prepareSchedulableLeaf(owner, PROBE);
    await makeAllLeavesSchedulable(owner);
    await scheduleLeaf(leaf.id, 5);

    const derived = await reDerivePinnedBaseline(deps(), ctx(), { projectId: PROBE.projectId });
    expect(derived.ok).toBe(false);
    if (derived.ok) return;
    expect(derived.error.code).toBe('invalid_input');
    expect(derived.error.details?.baseline).toContain('no_baseline');
  });
});
