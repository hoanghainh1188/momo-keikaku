/**
 * Epic 2 risk gate / retro F13: NFR-P1 full recalculation under the per-Project fence lock.
 *
 * Spec (`epics.md` story 2.9 / AR-53): synchronous recalculation inside the fence transaction,
 * measured as p95 ≤ 300 ms on Epic 1's 500-WP fixture — not a domain-only single sample.
 */
import { performance } from 'node:perf_hooks';
import { afterAll, describe, expect, it } from 'vitest';
import { and, eq, sql } from 'drizzle-orm';
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
import {
  generateLoadFixture,
  LOAD_WP_PER_PROJECT,
} from '../../packages/db/src/load-generator';

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

const PROBE = buildProbeTenant('xtprobe-nfrp1', 941_000_000);
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
    userId: 'user-nfrp1',
    roles: ['pm'] as const,
    locale: 'en' as const,
    projectIds: [PROBE.projectId],
  };
}

/** Inclusive empirical p95 — ceil(0.95 × n)-th sample of a sorted ascending array (1-based). */
function percentile95(samplesMs: readonly number[]): number {
  if (samplesMs.length === 0) throw new Error('percentile95: empty samples');
  const sorted = [...samplesMs].sort((a, b) => a - b);
  const rank = Math.ceil(0.95 * sorted.length);
  return sorted[Math.max(0, rank - 1)]!;
}

/**
 * Soft-delete the demo WPs on the probe Project and insert one load-fixture Project's 500 WPs
 * (leaves duration=2). NFR-P1 names the 500-WP shape; the long 500-edge chain is AR-50's
 * payload measure and would walk past a typical calendar range, so it is not used here.
 */
async function seedFiveHundredWpPlan(owner: ReturnType<typeof getDb>): Promise<{
  readonly leafId: string;
  readonly wpCount: number;
}> {
  const load = generateLoadFixture();
  const project = load.projects[0]!;
  expect(project.wps).toHaveLength(LOAD_WP_PER_PROJECT);

  const idOf = (fixtureId: string) => `${PROBE.projectId}__${fixtureId}`;
  const childCounts = new Map<string, number>();
  for (const w of project.wps) {
    if (w.parentId === null) continue;
    const parent = idOf(w.parentId);
    childCounts.set(parent, (childCounts.get(parent) ?? 0) + 1);
  }

  // Fixed instant — bare `new Date()` is banned (Clock rule); soft-delete stamp need not be wall time.
  const now = new Date('2026-09-27T12:00:00.000Z');
  await withTenant(owner, PROBE.tenantId, async (tx) => {
    await tx
      .update(s.project)
      .set({
        projectStart: '2026-01-05',
        dataDate: '2026-01-05',
        projectFinish: null,
      })
      .where(eq(s.project.id, PROBE.projectId));

    await tx
      .update(s.workPackage)
      .set({ deletedAt: now })
      .where(
        and(
          eq(s.workPackage.tenantId, PROBE.tenantId),
          eq(s.workPackage.projectId, PROBE.projectId),
          sql`${s.workPackage.deletedAt} IS NULL`,
        ),
      );

    // Drop demo edges so loadPlanRows does not re-introduce endpoints for soft-deleted WPs.
    await tx
      .delete(s.wpDependency)
      .where(
        and(
          eq(s.wpDependency.tenantId, PROBE.tenantId),
          eq(s.wpDependency.projectId, PROBE.projectId),
        ),
      );

    await tx.insert(s.workPackage).values(
      project.wps.map((w) => {
        const id = idOf(w.id);
        const childCount = childCounts.get(id) ?? 0;
        const isLeaf = childCount === 0;
        return {
          id,
          tenantId: PROBE.tenantId,
          projectId: PROBE.projectId,
          wbsCode: w.wbsCode,
          name: w.name,
          parentId: w.parentId === null ? null : idOf(w.parentId),
          childCount,
          isMilestone: false,
          isCatchAll: w.isCatchAll,
          durationDays: isLeaf ? 2 : null,
          constraintType: 'asap' as const,
          constraintDate: null,
          plannedMh: w.plannedMh,
          assignedResourceIds: [] as string[],
          deletedAt: null,
        };
      }),
    );

    // Short FS links inside each phase (leaf i → leaf i+1) — enough graph work without
    // walking years past the Holiday Calendar range.
    const byParent = new Map<string, string[]>();
    for (const w of project.wps) {
      if (w.parentId === null) continue;
      if ((childCounts.get(idOf(w.id)) ?? 0) !== 0) continue;
      const list = byParent.get(w.parentId) ?? [];
      list.push(idOf(w.id));
      byParent.set(w.parentId, list);
    }
    const shortEdges: {
      tenantId: string;
      projectId: string;
      predecessorWpId: string;
      successorWpId: string;
      type: 'FS';
      lagDays: number;
      predIsLeaf: boolean;
      succIsLeaf: boolean;
    }[] = [];
    for (const leaves of byParent.values()) {
      for (let i = 1; i < leaves.length; i += 1) {
        shortEdges.push({
          tenantId: PROBE.tenantId,
          projectId: PROBE.projectId,
          predecessorWpId: leaves[i - 1]!,
          successorWpId: leaves[i]!,
          type: 'FS',
          lagDays: 0,
          predIsLeaf: true,
          succIsLeaf: true,
        });
      }
    }
    if (shortEdges.length > 0) {
      await tx.insert(s.wpDependency).values(shortEdges);
    }
  });

  const leaves = project.wps.filter((w) => (childCounts.get(idOf(w.id)) ?? 0) === 0);
  return {
    leafId: idOf(leaves[0]!.id),
    wpCount: LOAD_WP_PER_PROJECT,
  };
}

describe.skipIf(!reachable)('NFR-P1 fence-under-lock (story 2.9 / retro F13)', () => {
  it('applyPlanChange on a 500-WP plan stays under 300 ms p95 while holding the Project lock', async () => {
    const owner = getDb(OWNER_DATABASE_URL!);
    const app = getDb(APP_DATABASE_URL!);
    await createProbeTenant(owner, PROBE);

    const seeded = await seedFiveHundredWpPlan(owner);
    expect(seeded.wpCount).toBe(500);

    const deps = { handle: app, transaction: inTenantTransaction };
    const patch = (durationDays: number) =>
      applyPlanChange(deps, ctx(), {
        kind: 'patch_duration',
        projectId: PROBE.projectId,
        wpId: seeded.leafId,
        durationDays,
      });

    // Warm JIT + DB plans before sampling.
    for (let i = 0; i < 3; i += 1) {
      const warm = await patch(2 + (i % 2));
      expect(warm.ok).toBe(true);
      if (warm.ok) {
        expect(
          warm.value.kind,
          `warmup haltedReason=${String(warm.value.haltedReason)}`,
        ).toBe('scheduled');
      }
    }

    const samples: number[] = [];
    const SAMPLE_COUNT = 20;
    for (let i = 0; i < SAMPLE_COUNT; i += 1) {
      const durationDays = 2 + (i % 2);
      const t0 = performance.now();
      const result = await patch(durationDays);
      const elapsed = performance.now() - t0;
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value.kind).toBe('scheduled');
      samples.push(elapsed);
    }

    const p95 = percentile95(samples);
    // Budget is NFR-P1 / AR-53. Fail loudly with the distribution so a miss is diagnosable.
    expect(
      p95,
      `p95=${p95.toFixed(1)}ms samples=[${samples.map((x) => x.toFixed(0)).join(',')}]`,
    ).toBeLessThan(300);
  }, 120_000);
});
