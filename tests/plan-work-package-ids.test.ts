/**
 * A PLANNED WORK PACKAGE'S ID COMES FROM THE ID PORT, NOT FROM THE CLOCK.
 *
 * Epic 1 retrospective, deferred-work audit finding A1. `recordPlanDisposition` built the new
 * Work Package's id as `wp-new-${stamp.at.getTime()}` — the Project's anchor, in milliseconds —
 * while `work_package.id` is a GLOBAL primary key (`schema.ts`: `id: text('id').primaryKey()`,
 * with `tenant_id` beside the key rather than in it).
 *
 * Two consequences, one of them serious:
 *
 *   1. Planning twice on one Project collides, because the demo Clock is fixed. The code knew
 *      this and said so in a comment.
 *   2. TWO DIFFERENT TENANTS planning at the same anchor millisecond collide too — and in the
 *      demo every Project shares one anchor, so this is the ordinary case rather than a race. A
 *      PM in Tenant A then gets a failure instead of a success *because of Tenant B's rows*: a
 *      low-bandwidth existence oracle, in the product whose central claim is that nothing crosses
 *      a Tenant. Three separate ledger entries recorded this as three problems; it is one.
 *
 * The fix was already wired and simply never used here: `uuidV7IdsOn` reaches every write through
 * `WriteDeps.ids`, and `createProject` has taken its id from that port since story 1.3. These
 * assertions are the second case first, because it is the one no comment admitted to.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { planTicketsAsWorkPackage } from '../packages/app/src/use-cases';
import { closeAllPools } from '../packages/db/src/client';
import {
  assertProbeTenantsDisjoint,
  buildProbeTenant,
  createProbeTenant,
  removeProbeTenant,
} from '../packages/db/src/probe-tenants';
import * as schema from '../packages/db/src/schema';
import { withTenant } from '../packages/db/src/with-tenant';
import { adminContextFor } from './request-context';
import { connectWriteHarness, idPort, owner, restrictedWriteDeps, targetOf } from './write-harness';

const reachable = await connectWriteHarness({
  ownerUrl: process.env.DATABASE_URL,
  appUrl: process.env.APP_DATABASE_URL,
  requireDb: process.env.REQUIRE_DB === '1',
});

/**
 * TWO probe Tenants, because the sharpest assertion is a cross-Tenant one. Their `seq` bands are
 * disjoint from every other suite's, as always — but the defect under test is precisely that the
 * Work Package id is NOT derived from anything Tenant-scoped, so disjoint bands do not save it.
 */
const PROBE_A = buildProbeTenant('xtprobe-pidA', 900_000_000);
const PROBE_B = buildProbeTenant('xtprobe-pidB', 910_000_000);
assertProbeTenantsDisjoint([PROBE_A, PROBE_B]);

/**
 * ONE id port for the suite, not one per call. `idPort` hands out `<prefix>-0001`, `-0002`, … from
 * its own counter, so a fresh port per call would re-issue `-0001` every time and collide for a
 * reason that has nothing to do with the defect under test.
 */
const IDS = idPort('xtpid-id');
const deps = () => restrictedWriteDeps(IDS);

/**
 * Filtered by `tenant_id` EXPLICITLY. `owner()` is a superuser, which bypasses FORCE ROW LEVEL
 * SECURITY, so `withTenant` sets `app.tenant_id` here and nothing enforces it — an unfiltered read
 * returns every Tenant's rows and the cross-Tenant assertion below would compare a set with
 * itself. (The same trap cost `tests/identity.test.ts` a one-in-eight flake; see retro F1.)
 */
async function workPackageIds(tenantId: string): Promise<string[]> {
  const rows = await withTenant(owner(), tenantId, (tx) =>
    tx
      .select({ id: schema.workPackage.id })
      .from(schema.workPackage)
      .where(eq(schema.workPackage.tenantId, tenantId)),
  );
  return rows.map((r) => r.id);
}

/** Plans one new Work Package over the probe's own Tickets. */
async function plan(probe: ReturnType<typeof buildProbeTenant>, name: string) {
  const own = targetOf(probe, probe.tenantId);
  return planTicketsAsWorkPackage(deps(), adminContextFor(probe.tenantId), {
    projectId: own.projectId,
    name,
    ticketIds: [...own.ticketIds],
  });
}

beforeAll(async () => {
  if (!reachable) return;
  await createProbeTenant(owner(), PROBE_A);
  await createProbeTenant(owner(), PROBE_B);
}, 120_000);

afterAll(async () => {
  if (!reachable) return;
  await removeProbeTenant(owner(), PROBE_A);
  await removeProbeTenant(owner(), PROBE_B);
  await closeAllPools();
}, 120_000);

describe.skipIf(!reachable)('a planned Work Package takes its id from the id port (retro A1)', () => {
  it('lets two Tenants plan without one colliding on the other, at the same anchor', async () => {
    // Both probe Tenants are relabelled copies of one fixture, so both Projects carry the SAME
    // demo anchor — which is exactly the situation an anchor-derived id cannot survive.
    const a = await plan(PROBE_A, 'Tenant A plans');
    expect(a, 'Tenant A could not plan at all').toMatchObject({ ok: true });

    const b = await plan(PROBE_B, 'Tenant B plans');
    expect(
      b,
      'Tenant B was refused because Tenant A had already planned at the same anchor — a foreign ' +
        "Tenant's rows decided the outcome of this write",
    ).toMatchObject({ ok: true });

    const idsA = await workPackageIds(PROBE_A.tenantId);
    const idsB = await workPackageIds(PROBE_B.tenantId);
    expect(
      idsA.filter((id) => idsB.includes(id)),
      'the two Tenants share a Work Package id',
    ).toEqual([]);
  });

  it('lets one Project be planned twice, under a fixed Clock', async () => {
    const before = (await workPackageIds(PROBE_A.tenantId)).length;

    const first = await plan(PROBE_A, 'First plan');
    expect(first).toMatchObject({ ok: true });
    const second = await plan(PROBE_A, 'Second plan');
    expect(second, 'the second Plan collided with the first on the primary key').toMatchObject({
      ok: true,
    });

    const after = await workPackageIds(PROBE_A.tenantId);
    expect(after).toHaveLength(before + 2);
    expect(new Set(after).size, 'two Work Packages share an id').toBe(after.length);
  });

  it('issues an id that is not derived from the Clock', async () => {
    const result = await plan(PROBE_B, 'Not from the clock');
    expect(result).toMatchObject({ ok: true });

    const ids = await workPackageIds(PROBE_B.tenantId);
    expect(
      ids.filter((id) => /^wp-new-\d+$/.test(id)),
      'a Work Package id still reads as `wp-new-<epoch ms>`, so it is the Clock and not the port',
    ).toEqual([]);
  });
});
