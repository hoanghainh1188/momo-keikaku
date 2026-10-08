/**
 * Story 5.12 fence: Catch-all toggle dual-writes wp_flag_event + live column;
 * refuses summary and milestone WPs.
 */
import { describe, expect, it } from 'vitest';
import { and, asc, eq } from 'drizzle-orm';
import { applyPlanChange } from '../../packages/app/src/schedule/apply-plan-change';
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

const PROBE = buildProbeTenant('xtprobe-s512', 962_000_000);
assertProbeTenantsDisjoint([PROBE]);
await installFenceAfterAll({ reachable, ownerUrl: OWNER_DATABASE_URL, probe: PROBE });

const ctx = () => pmCtx(PROBE, { userId: 'user-s512' });
const deps = (app: ReturnType<typeof getDb>) => ({
  handle: app,
  transaction: inTenantTransaction,
});

describe.skipIf(!reachable)('applyPlanChange fence (story 5.12 Catch-all)', () => {
  it('dual-writes wp_flag_event and work_package.is_catch_all on a leaf', async () => {
    const owner = getDb(OWNER_DATABASE_URL!);
    const app = getDb(APP_DATABASE_URL!);
    const leaf = await prepareSchedulableLeaf(owner, PROBE);

    const result = await applyPlanChange(deps(app), ctx(), {
      kind: 'patch_catch_all',
      projectId: PROBE.projectId,
      wpId: leaf.id,
      isCatchAll: true,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const [wp] = await withTenant(app, PROBE.tenantId, async (tx) =>
      tx
        .select({ isCatchAll: s.workPackage.isCatchAll })
        .from(s.workPackage)
        .where(
          and(
            eq(s.workPackage.tenantId, PROBE.tenantId),
            eq(s.workPackage.id, leaf.id),
          ),
        ),
    );
    expect(wp?.isCatchAll).toBe(true);

    const events = await withTenant(app, PROBE.tenantId, async (tx) =>
      tx
        .select({
          wpId: s.wpFlagEvent.wpId,
          isCatchAll: s.wpFlagEvent.isCatchAll,
        })
        .from(s.wpFlagEvent)
        .where(
          and(
            eq(s.wpFlagEvent.tenantId, PROBE.tenantId),
            eq(s.wpFlagEvent.projectId, PROBE.projectId),
            eq(s.wpFlagEvent.wpId, leaf.id),
          ),
        )
        .orderBy(asc(s.wpFlagEvent.seq)),
    );
    expect(events.at(-1)).toEqual({ wpId: leaf.id, isCatchAll: true });
  });

  it('refuses a summary WP with leaf_only', async () => {
    const owner = getDb(OWNER_DATABASE_URL!);
    const app = getDb(APP_DATABASE_URL!);
    await prepareSchedulableLeaf(owner, PROBE);
    const summary = PROBE.state.wps.find((w) => !w.isLeaf);
    if (!summary) throw new Error('fixture needs a summary WP');

    const result = await applyPlanChange(deps(app), ctx(), {
      kind: 'patch_catch_all',
      projectId: PROBE.projectId,
      wpId: summary.id,
      isCatchAll: true,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('invalid_input');
    expect(result.error.details?.isCatchAll).toEqual(['leaf_only']);
  });

  it('refuses a milestone WP with milestone_not_allowed', async () => {
    const owner = getDb(OWNER_DATABASE_URL!);
    const app = getDb(APP_DATABASE_URL!);
    await prepareSchedulableLeaf(owner, PROBE);
    const milestone = PROBE.state.wps.find((w) => w.isLeaf && w.isMilestone);
    if (!milestone) throw new Error('fixture needs a milestone WP');

    const result = await applyPlanChange(deps(app), ctx(), {
      kind: 'patch_catch_all',
      projectId: PROBE.projectId,
      wpId: milestone.id,
      isCatchAll: true,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('invalid_input');
    expect(result.error.details?.isCatchAll).toEqual(['milestone_not_allowed']);
  });
});
