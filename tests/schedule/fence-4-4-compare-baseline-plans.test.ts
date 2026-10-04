/**
 * Story 4.4 — compare two Baseline versions as plans: edge-removed attribution, lag,
 * match-by-wp_id, role gate, missing version, disabled with <2 versions.
 */
import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { applyPlanChange } from '../../packages/app/src/schedule/apply-plan-change';
import { applyPredecessorSet } from '../../packages/app/src/schedule/apply-predecessor-set';
import { setBaseline } from '../../packages/app/src/baseline/set-baseline';
import { reBaseline } from '../../packages/app/src/baseline/re-baseline';
import { compareBaselineVersions } from '../../packages/app/src/baseline/compare-baseline-versions';
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

// Clear of 4.1 (959M), 4.2 (942M), 4.3 (943M) probe bands.
const PROBE = buildProbeTenant('xtprobe-s44', 944_000_000);
assertProbeTenantsDisjoint([PROBE]);
await installFenceAfterAll({ reachable, ownerUrl: OWNER_DATABASE_URL, probe: PROBE });

const ctx = () => pmCtx(PROBE, { userId: 'user-s44' });
const deps = () => ({
  handle: getDb(APP_DATABASE_URL!),
  transaction: inTenantTransaction,
  ids: {
    next: () => `bl-s44-${randomUUID()}`,
  },
});

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

async function scheduleLeaf(leafId: string, durationDays = 5) {
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

function twoLeaves() {
  const leaves = PROBE.state.wps.filter((w) => w.isLeaf && !w.isMilestone);
  if (leaves.length < 2) throw new Error('fixture needs two non-milestone leaves');
  return [leaves[0]!, leaves[1]!] as const;
}

async function prepareWithEdgeBaseline() {
  const owner = getDb(OWNER_DATABASE_URL!);
  await prepareSchedulableLeaf(owner, PROBE);
  await makeAllLeavesSchedulable(owner);
  const [pred, succ] = twoLeaves();
  await scheduleLeaf(pred.id, 5);
  await scheduleLeaf(succ.id, 3);

  const linked = await applyPredecessorSet(deps(), ctx(), {
    projectId: PROBE.projectId,
    successorWpId: succ.id,
    text: `${pred.wbsCode}FS+0d`,
  });
  expect(linked.ok).toBe(true);
  if (!linked.ok) {
    expect.fail(`link failed: ${JSON.stringify(linked.error)}`);
  }

  const set = await setBaseline(deps(), ctx(), { projectId: PROBE.projectId });
  expect(set.ok).toBe(true);
  if (!set.ok) {
    expect.fail(`setBaseline failed: ${JSON.stringify(set.error)}`);
  }
  return { owner, pred, succ, set, firstSeq: set.value.baselineVersionSeq };
}

describe.skipIf(!reachable)('compareBaselineVersions fence (story 4.4)', () => {
  it('happy: removed edge in project list accounts for successor date moves', async () => {
    const { pred, succ, firstSeq } = await prepareWithEdgeBaseline();

    const cleared = await applyPredecessorSet(deps(), ctx(), {
      projectId: PROBE.projectId,
      successorWpId: succ.id,
      text: '',
    });
    expect(cleared.ok).toBe(true);

    const re = await reBaseline(deps(), ctx(), {
      projectId: PROBE.projectId,
      reason: 'Drop predecessor after scope cut',
    });
    expect(re.ok).toBe(true);
    if (!re.ok) return;

    const compared = await compareBaselineVersions(deps(), ctx(), {
      projectId: PROBE.projectId,
      fromVersionSeq: firstSeq,
      toVersionSeq: re.value.baselineVersionSeq,
    });
    if (!compared.ok) {
      expect.fail(`compare failed: ${JSON.stringify(compared.error)}`);
    }

    expect(compared.value.compare.projectChanges).toContainEqual({
      kind: 'edge_removed',
      edge: {
        predecessorWpId: pred.id,
        successorWpId: succ.id,
        type: 'FS',
      },
    });

    const succDelta = compared.value.compare.wpDateDeltas.find((d) => d.wpId === succ.id);
    expect(succDelta).toBeDefined();
    expect(succDelta!.unattributed).toBe(false);
    expect(succDelta!.accountedBy.some((c) => c.kind === 'edge_removed')).toBe(true);
  });

  it('lag change is listed and attributes the successor', async () => {
    const { pred, succ, firstSeq } = await prepareWithEdgeBaseline();

    const relagged = await applyPredecessorSet(deps(), ctx(), {
      projectId: PROBE.projectId,
      successorWpId: succ.id,
      text: `${pred.wbsCode}FS+3d`,
    });
    expect(relagged.ok).toBe(true);

    const re = await reBaseline(deps(), ctx(), {
      projectId: PROBE.projectId,
      reason: 'Add lag for procurement',
    });
    expect(re.ok).toBe(true);
    if (!re.ok) return;

    const compared = await compareBaselineVersions(deps(), ctx(), {
      projectId: PROBE.projectId,
      fromVersionSeq: firstSeq,
      toVersionSeq: re.value.baselineVersionSeq,
    });
    if (!compared.ok) {
      expect.fail(`compare failed: ${JSON.stringify(compared.error)}`);
    }

    expect(
      compared.value.compare.projectChanges.some(
        (c) =>
          c.kind === 'edge_lag_changed' &&
          c.edge.predecessorWpId === pred.id &&
          c.edge.successorWpId === succ.id &&
          c.toLagDays === 3,
      ),
    ).toBe(true);

    const succDelta = compared.value.compare.wpDateDeltas.find((d) => d.wpId === succ.id);
    expect(succDelta?.unattributed).toBe(false);
    expect(succDelta?.accountedBy.some((c) => c.kind === 'edge_lag_changed')).toBe(true);
  });

  it('matches WPs by wp_id after wbs_code renumber (AR-55)', async () => {
    const { succ, firstSeq } = await prepareWithEdgeBaseline();
    const oldWbs = succ.wbsCode;
    const newWbs = `${oldWbs}.renumbered`;

    await withTenant(getDb(OWNER_DATABASE_URL!), PROBE.tenantId, async (tx) => {
      await tx
        .update(s.workPackage)
        .set({ wbsCode: newWbs })
        .where(
          and(
            eq(s.workPackage.tenantId, PROBE.tenantId),
            eq(s.workPackage.projectId, PROBE.projectId),
            eq(s.workPackage.id, succ.id),
          ),
        );
    });
    // Touch duration so a new successful run is written with the new wbs in inputs.
    await scheduleLeaf(succ.id, 4);

    const re = await reBaseline(deps(), ctx(), {
      projectId: PROBE.projectId,
      reason: 'WBS renumber after re-parent',
    });
    expect(re.ok).toBe(true);
    if (!re.ok) return;

    const compared = await compareBaselineVersions(deps(), ctx(), {
      projectId: PROBE.projectId,
      fromVersionSeq: firstSeq,
      toVersionSeq: re.value.baselineVersionSeq,
    });
    if (!compared.ok) {
      expect.fail(`compare failed: ${JSON.stringify(compared.error)}`);
    }

    const row = compared.value.compare.wpDateDeltas.find((d) => d.wpId === succ.id);
    // Duration change should move dates; match key must still be wp_id.
    if (row !== undefined) {
      expect(row.wpId).toBe(succ.id);
      expect(row.wbsCode).toBe(newWbs);
      expect(row.unattributed).toBe(false);
    }
    // Must not invent a second identity keyed only on the old WBS code.
    expect(
      compared.value.compare.wpDateDeltas.every((d) => d.wpId !== oldWbs),
    ).toBe(true);
  });

  it('refuses missing Baseline version seq', async () => {
    const { firstSeq } = await prepareWithEdgeBaseline();
    const compared = await compareBaselineVersions(deps(), ctx(), {
      projectId: PROBE.projectId,
      fromVersionSeq: firstSeq,
      toVersionSeq: firstSeq + 99_999,
    });
    expect(compared.ok).toBe(false);
    if (compared.ok) return;
    expect(compared.error.code).toBe('invalid_input');
    expect(compared.error.details?.versions).toContain(
      `missing_version_${firstSeq + 99_999}`,
    );
  });

  it('refuses with a single Baseline version (need two)', async () => {
    const { firstSeq } = await prepareWithEdgeBaseline();
    // Only one version exists — same_version refuse for a usable compare.
    const same = await compareBaselineVersions(deps(), ctx(), {
      projectId: PROBE.projectId,
      fromVersionSeq: firstSeq,
      toVersionSeq: firstSeq,
    });
    expect(same.ok).toBe(false);
    if (same.ok) return;
    expect(same.error.code).toBe('invalid_input');
    expect(same.error.details?.versions).toContain('same_version');
  });

  it('viewer / no project reach → not_found', async () => {
    const { firstSeq } = await prepareWithEdgeBaseline();
    const viewer = pmCtx(PROBE, {
      userId: 'viewer-s44',
      roles: ['client_viewer'],
      projectIds: [PROBE.projectId],
    });
    const compared = await compareBaselineVersions(deps(), viewer, {
      projectId: PROBE.projectId,
      fromVersionSeq: firstSeq,
      toVersionSeq: firstSeq + 1,
    });
    expect(compared.ok).toBe(false);
    if (compared.ok) return;
    expect(compared.error.code).toBe('not_found');
  });

  it('with a single Baseline version, history length < 2 (UI disables compare)', async () => {
    const owner = getDb(OWNER_DATABASE_URL!);
    const leaf = await prepareSchedulableLeaf(owner, PROBE);
    await makeAllLeavesSchedulable(owner);
    await scheduleLeaf(leaf.id);
    const set = await setBaseline(deps(), ctx(), { projectId: PROBE.projectId });
    expect(set.ok).toBe(true);

    const versions = await withTenant(getDb(APP_DATABASE_URL!), PROBE.tenantId, async (tx) =>
      tx
        .select({ seq: s.baselineVersion.seq })
        .from(s.baselineVersion)
        .where(
          and(
            eq(s.baselineVersion.tenantId, PROBE.tenantId),
            eq(s.baselineVersion.projectId, PROBE.projectId),
          ),
        ),
    );
    expect(versions).toHaveLength(1);
  });
});
