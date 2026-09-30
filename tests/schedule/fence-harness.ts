/**
 * Shared fence-suite preamble — dual-role reachability, REQUIRE_DB gate, seed-suite lock,
 * afterAll probe teardown, default PM request context, and the common schedulable-leaf prepare.
 *
 * Test-only wiring (Epic 2 retro F6). Suites keep their own PROBE slug/seq band and any
 * specialized prepare. Do not import `tests/write-harness.ts` from fence suites.
 */
import { afterAll } from 'vitest';
import { and, eq } from 'drizzle-orm';
import type { Locale, Role } from '../../packages/app/src/authz/request-context';
import { closeAllPools, getDb, getPool, type Db } from '../../packages/db/src/client';
import {
  createProbeTenant,
  removeProbeTenant,
  type ProbeTenant,
} from '../../packages/db/src/probe-tenants';
import * as s from '../../packages/db/src/schema';
import { acquireSeedSuiteLock, releaseSeedSuiteLock } from '../../packages/db/src/seed-suite-lock';
import { withTenant } from '../../packages/db/src/with-tenant';

export interface FenceHarnessEnv {
  readonly ownerUrl: string | undefined;
  readonly appUrl: string | undefined;
  /** REQUIRE_DB=1: unreachable DB fails the suite instead of skipping. */
  readonly requireDb: boolean;
}

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

/**
 * Dual-role reachability + REQUIRE_DB fail + shared seed-suite lock when reachable.
 * Call before building the suite PROBE; order with installFenceAfterAll is
 * reachability → probe build → afterAll (lock is taken here when reachable).
 */
export async function connectFenceHarness(
  env: FenceHarnessEnv,
): Promise<{ reachable: boolean }> {
  const reachable = (await reachableAs(env.ownerUrl)) && (await reachableAs(env.appUrl));
  if (env.requireDb && !reachable) {
    throw new Error('REQUIRE_DB=1 but DATABASE_URL or APP_DATABASE_URL is unreachable.');
  }
  if (reachable) {
    await acquireSeedSuiteLock(env.ownerUrl!, 'shared');
  }
  return { reachable };
}

/** Registers afterAll: remove probe (when reachable), release seed lock, close pools. */
export function installFenceAfterAll(opts: {
  readonly reachable: boolean;
  readonly ownerUrl: string | undefined;
  readonly probe: ProbeTenant;
}): void {
  afterAll(async () => {
    if (opts.reachable) {
      await removeProbeTenant(getDb(opts.ownerUrl!), opts.probe).catch(() => {});
    }
    await releaseSeedSuiteLock();
    await closeAllPools();
  });
}

export interface PmCtxOptions {
  readonly userId: string;
  readonly projectIds?: readonly string[];
  readonly roles?: readonly Role[];
  readonly locale?: Locale;
}

/** Default PM request context for fence suites (tenant + project from the probe). */
export function pmCtx(probe: ProbeTenant, options: PmCtxOptions) {
  return {
    tenantId: probe.tenantId,
    userId: options.userId,
    roles: options.roles ?? (['pm'] as const),
    locale: options.locale ?? ('en' as const),
    projectIds: options.projectIds ? [...options.projectIds] : [probe.projectId],
  };
}

/**
 * Creates the probe tenant, sets Project dates 2026-09-01 / 2026-10-05, and leaf
 * durationDays: 3 ASAP. Throws if the fixture has no non-milestone leaf.
 */
export async function prepareSchedulableLeaf(owner: Db, probe: ProbeTenant) {
  await createProbeTenant(owner, probe);
  const leaf = probe.state.wps.find((w) => w.isLeaf && !w.isMilestone);
  if (!leaf) throw new Error('fixture needs a leaf WP');
  await withTenant(owner, probe.tenantId, async (tx) => {
    await tx
      .update(s.project)
      .set({ projectStart: '2026-09-01', dataDate: '2026-10-05', projectFinish: null })
      .where(eq(s.project.id, probe.projectId));
    await tx
      .update(s.workPackage)
      .set({ durationDays: 3, constraintType: 'asap', constraintDate: null })
      .where(
        and(
          eq(s.workPackage.tenantId, probe.tenantId),
          eq(s.workPackage.projectId, probe.projectId),
          eq(s.workPackage.id, leaf.id),
        ),
      );
  });
  return leaf;
}
