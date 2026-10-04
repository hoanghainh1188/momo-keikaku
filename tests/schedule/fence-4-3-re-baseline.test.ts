/**
 * Story 4.3 — reBaseline matrix: happy append, blank reason, no baseline, incomplete refuse,
 * append-only, history actor, role gate; optional re-derive of the new pin.
 */
import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { and, asc, eq, sql } from 'drizzle-orm';
import { setBaseline } from '../../packages/app/src/baseline/set-baseline';
import { reBaseline } from '../../packages/app/src/baseline/re-baseline';
import { getReBaselineState } from '../../packages/app/src/baseline/set-baseline-state';
import { reDerivePinnedBaseline } from '../../packages/app/src/baseline/re-derive-pinned';
import { getDb } from '../../packages/db/src/client';
import {
  assertProbeTenantsDisjoint,
  buildProbeTenant,
  createProbeTenant,
} from '../../packages/db/src/probe-tenants';
import { loadProjectBundle } from '../../packages/db/src/repo';
import * as s from '../../packages/db/src/schema';
import { APPEND_ONLY_ERRCODE } from '../../packages/db/src/sql/generate';
import { inTenantTransaction } from '../../packages/db/src/tenant-transaction';
import { withTenant } from '../../packages/db/src/with-tenant';
import {
  connectFenceHarness,
  installFenceAfterAll,
  makeAllLeavesSchedulable,
  pmCtx,
  prepareSchedulableLeaf,
  refusalPgCode,
  scheduleLeaf,
} from './fence-harness';

const OWNER_DATABASE_URL = process.env.DATABASE_URL;
const APP_DATABASE_URL = process.env.APP_DATABASE_URL;

const { reachable } = await connectFenceHarness({
  ownerUrl: OWNER_DATABASE_URL,
  appUrl: APP_DATABASE_URL,
  requireDb: process.env.REQUIRE_DB === '1',
});

// Clear of 4.1 (959M) and 4.2 (942M) probe bands.
const PROBE = buildProbeTenant('xtprobe-s43', 943_000_000);
assertProbeTenantsDisjoint([PROBE]);
await installFenceAfterAll({ reachable, ownerUrl: OWNER_DATABASE_URL, probe: PROBE });


const ctx = () => pmCtx(PROBE, { userId: 'user-s43' });
/** Globally unique ids — `baseline_wp.id` is a global PK across Set + Re-baseline appends. */
const deps = () => ({
  handle: getDb(APP_DATABASE_URL!),
  transaction: inTenantTransaction,
  ids: {
    next: () => `bl-s43-${randomUUID()}`,
  },
});

async function prepareWithFirstBaseline() {
  const owner = getDb(OWNER_DATABASE_URL!);
  const leaf = await prepareSchedulableLeaf(owner, PROBE);
  await makeAllLeavesSchedulable(owner, PROBE);
  const runSeq = await scheduleLeaf(deps(), ctx(), PROBE.projectId, leaf.id);
  const set = await setBaseline(deps(), ctx(), { projectId: PROBE.projectId });
  expect(set.ok).toBe(true);
  if (!set.ok) {
    expect.fail(`setBaseline failed: ${set.error.code} ${JSON.stringify(set.error.details)}`);
  }
  return { owner, leaf, runSeq, set };
}

describe.skipIf(!reachable)('reBaseline fence (story 4.3)', () => {
  it('happy path: appends a new version with reason, author, audit; pin still re-derives', async () => {
    const { leaf, runSeq } = await prepareWithFirstBaseline();
    // Schedule again so Re-baseline can pin a newer successful head.
    const secondRun = await scheduleLeaf(deps(), ctx(), PROBE.projectId, leaf.id, 6);

    const beforeState = await getReBaselineState(deps(), ctx(), { projectId: PROBE.projectId });
    expect(beforeState.ok).toBe(true);
    if (beforeState.ok) {
      expect(beforeState.value.hasBaseline).toBe(true);
      expect(beforeState.value.canReBaseline).toBe(true);
    }

    const reason = 'Scope agreed with client after design review';
    const result = await reBaseline(deps(), ctx(), {
      projectId: PROBE.projectId,
      reason,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      expect.fail(`reBaseline failed: ${result.error.code} ${JSON.stringify(result.error.details)}`);
    }
    expect(result.value.scheduleRunSeq).toBe(secondRun);
    expect(result.value.reason).toBe(reason);
    expect(result.value.baselineVersionSeq).toBeGreaterThan(1);

    const versions = await withTenant(getDb(APP_DATABASE_URL!), PROBE.tenantId, async (tx) =>
      tx
        .select()
        .from(s.baselineVersion)
        .where(
          and(
            eq(s.baselineVersion.tenantId, PROBE.tenantId),
            eq(s.baselineVersion.projectId, PROBE.projectId),
          ),
        )
        .orderBy(asc(s.baselineVersion.seq)),
    );
    expect(versions).toHaveLength(2);
    expect(versions[0]!.scheduleRunSeq).toBe(runSeq);
    expect(versions[1]!.reason).toBe(reason);
    expect(versions[1]!.actor).toBe('user:user-s43');
    expect(versions[1]!.scheduleRunSeq).toBe(secondRun);

    const bundle = await loadProjectBundle(
      getDb(APP_DATABASE_URL!),
      PROBE.tenantId,
      PROBE.projectId,
    );
    expect(bundle.input.baselineVersions).toHaveLength(2);
    expect(bundle.input.baselineVersions.map((b) => b.actor)).toEqual([
      'user:user-s43',
      'user:user-s43',
    ]);
    expect(bundle.input.baselineVersions[1]!.reason).toBe(reason);
    expect(bundle.input.activeBaselineSeq).toBe(versions[1]!.seq);

    const audits = await withTenant(getDb(APP_DATABASE_URL!), PROBE.tenantId, async (tx) =>
      tx
        .select({ action: s.auditLog.action })
        .from(s.auditLog)
        .where(
          and(
            eq(s.auditLog.tenantId, PROBE.tenantId),
            eq(s.auditLog.action, 'baseline.rebaseline'),
          ),
        ),
    );
    expect(audits).toHaveLength(1);

    // Continuity: latest pin still re-derives (4.2 gate over the new pin).
    const rederive = await reDerivePinnedBaseline(deps(), ctx(), {
      projectId: PROBE.projectId,
    });
    expect(rederive.ok).toBe(true);
  });

  it('refuses blank / whitespace reason and writes no new rows', async () => {
    await prepareWithFirstBaseline();
    const before = await withTenant(getDb(APP_DATABASE_URL!), PROBE.tenantId, async (tx) =>
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
    expect(before).toHaveLength(1);

    for (const reason of ['', '   ', '\t\n']) {
      const result = await reBaseline(deps(), ctx(), {
        projectId: PROBE.projectId,
        reason,
      });
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.code).toBe('invalid_input');
      expect(result.error.details?.reason).toContain('required');
    }

    const after = await withTenant(getDb(APP_DATABASE_URL!), PROBE.tenantId, async (tx) =>
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
    expect(after).toHaveLength(1);
  });

  it('refuses when no Baseline exists yet', async () => {
    const owner = getDb(OWNER_DATABASE_URL!);
    const leaf = await prepareSchedulableLeaf(owner, PROBE);
    await makeAllLeavesSchedulable(owner, PROBE);
    await scheduleLeaf(deps(), ctx(), PROBE.projectId, leaf.id);

    const result = await reBaseline(deps(), ctx(), {
      projectId: PROBE.projectId,
      reason: 'too early',
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('invalid_input');
    expect(result.error.details?.baseline).toContain('no_baseline');
    expect(result.error.details?.hint).toContain('use_set_baseline');

    const versions = await withTenant(getDb(APP_DATABASE_URL!), PROBE.tenantId, async (tx) =>
      tx
        .select()
        .from(s.baselineVersion)
        .where(
          and(
            eq(s.baselineVersion.tenantId, PROBE.tenantId),
            eq(s.baselineVersion.projectId, PROBE.projectId),
          ),
        ),
    );
    expect(versions).toHaveLength(0);
  });

  it('refuses incomplete plan after a Baseline exists', async () => {
    const { leaf } = await prepareWithFirstBaseline();
    const leaves = PROBE.state.wps.filter((w) => w.isLeaf && !w.isMilestone);
    const other = leaves.find((w) => w.id !== leaf.id);
    if (!other) throw new Error('need a second leaf');

    await withTenant(getDb(OWNER_DATABASE_URL!), PROBE.tenantId, async (tx) => {
      await tx
        .update(s.workPackage)
        .set({ durationDays: null })
        .where(
          and(
            eq(s.workPackage.tenantId, PROBE.tenantId),
            eq(s.workPackage.projectId, PROBE.projectId),
            eq(s.workPackage.id, other.id),
          ),
        );
    });

    const state = await getReBaselineState(deps(), ctx(), { projectId: PROBE.projectId });
    expect(state.ok).toBe(true);
    if (state.ok) {
      expect(state.value.canReBaseline).toBe(false);
      expect(state.value.blockingWpIds).toContain(other.id);
      expect(state.value.exceptionsRailHref).toContain('exceptions=not_schedulable');
    }

    const result = await reBaseline(deps(), ctx(), {
      projectId: PROBE.projectId,
      reason: 'should refuse',
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('invalid_input');
    expect(result.error.details?.baseline).toContain('incomplete_plan');

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

  it('append-only: UPDATE/DELETE on baseline_version / baseline_wp are refused after Re-baseline', async () => {
    const { leaf } = await prepareWithFirstBaseline();
    await scheduleLeaf(deps(), ctx(), PROBE.projectId, leaf.id, 7);
    const re = await reBaseline(deps(), ctx(), {
      projectId: PROBE.projectId,
      reason: 'append-only check',
    });
    expect(re.ok).toBe(true);
    if (!re.ok) return;

    const app = getDb(APP_DATABASE_URL!);
    const seq = re.value.baselineVersionSeq;

    const updateVersionCode = await refusalPgCode(
      withTenant(app, PROBE.tenantId, (tx) =>
        tx.execute(sql`UPDATE baseline_version SET reason = 'tampered' WHERE seq = ${seq}`),
      ),
    );
    expect(updateVersionCode, 'UPDATE baseline_version must be refused').toMatch(
      /^(42501|MOMO1)$/,
    );

    const updateWpCode = await refusalPgCode(
      withTenant(app, PROBE.tenantId, (tx) =>
        tx.execute(
          sql`UPDATE baseline_wp SET is_catch_all = true WHERE baseline_version_seq = ${seq}`,
        ),
      ),
    );
    expect(updateWpCode, 'UPDATE baseline_wp must be refused').toMatch(/^(42501|MOMO1)$/);

    const deleteWpCode = await refusalPgCode(
      withTenant(app, PROBE.tenantId, (tx) =>
        tx.execute(sql`DELETE FROM baseline_wp WHERE baseline_version_seq = ${seq}`),
      ),
    );
    expect(deleteWpCode, 'DELETE baseline_wp must be refused').toMatch(/^(42501|MOMO1)$/);

    const deleteVersionCode = await refusalPgCode(
      withTenant(app, PROBE.tenantId, (tx) =>
        tx.execute(sql`DELETE FROM baseline_version WHERE seq = ${seq}`),
      ),
    );
    expect(deleteVersionCode, 'DELETE baseline_version must be refused').toMatch(
      /^(42501|MOMO1)$/,
    );

    void APPEND_ONLY_ERRCODE;
  });

  it('answers not_found for a viewer with no project reach', async () => {
    await prepareWithFirstBaseline();
    const viewer = pmCtx(PROBE, {
      userId: 'user-s43-viewer',
      roles: ['client_viewer'],
      projectIds: [],
    });
    const result = await reBaseline(deps(), viewer, {
      projectId: PROBE.projectId,
      reason: 'no reach',
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('not_found');

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

  it('getReBaselineState reports no_baseline before first Set', async () => {
    const owner = getDb(OWNER_DATABASE_URL!);
    await createProbeTenant(owner, PROBE);
    const state = await getReBaselineState(deps(), ctx(), { projectId: PROBE.projectId });
    expect(state.ok).toBe(true);
    if (!state.ok) return;
    expect(state.value.hasBaseline).toBe(false);
    expect(state.value.canReBaseline).toBe(false);
    expect(state.value.refuseReason).toBe('no_baseline');
  });
});
