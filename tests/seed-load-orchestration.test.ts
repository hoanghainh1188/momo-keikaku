/**
 * Story 1.8: `seed({ profile: 'load' })` orchestration and `assertSingleTenantDatabase`.
 * Under REQUIRE_DB (via write harness), exercises the real truncate/replace path.
 */
import { afterAll, describe, expect, it } from 'vitest';
import { asc, count, sql } from 'drizzle-orm';
import { hashPassword } from '../packages/db/auth/src/password';
import { closeAllPools } from '../packages/db/src/client';
import {
  LOAD_PROJECT_COUNT,
  LOAD_TICKETS_PER_PROJECT,
  LOAD_WP_PER_PROJECT,
} from '../packages/db/src/load-generator';
import {
  assertProbeTenantsDisjoint,
  buildProbeTenant,
  createProbeTenant,
  removeProbeTenant,
} from '../packages/db/src/probe-tenants';
import * as schema from '../packages/db/src/schema';
import { seed } from '../packages/db/src/seed';
import { releaseSeedSuiteLock } from '../packages/db/src/seed-suite-lock';
import { connectWriteHarness, owner } from './write-harness';

const reachable = await connectWriteHarness({
  ownerUrl: process.env.DATABASE_URL,
  appUrl: process.env.APP_DATABASE_URL,
  requireDb: process.env.REQUIRE_DB === '1',
}, { seedLock: 'exclusive' });

const PROBE = buildProbeTenant('xtprobe-s8l', 880_000_000);
assertProbeTenantsDisjoint([PROBE]);

const FIXTURE_CLOCK_NOW = new Date('2027-03-01T15:30:00.000Z');
const clock = { now: () => new Date(FIXTURE_CLOCK_NOW.getTime()) };

/** The demo Tenant's anchor, read straight from the row the seed stamps it on. */
async function demoAnchor(): Promise<Date | undefined> {
  const rows = await owner().execute<{ demo_anchor: string | Date | null }>(
    sql`SELECT demo_anchor FROM project ORDER BY id LIMIT 1`,
  );
  const value = rows.rows[0]?.demo_anchor;
  return value ? new Date(value) : undefined;
}

/**
 * The anchor this suite FOUND, captured before anything destructive runs.
 *
 * Restoring the demo Tenant with `clock` above used to leave `project.demo_anchor` and
 * `baseline_version.recorded_at` stamped `2027-03-01T15:30:00.000Z` — this suite's fixture
 * Clock — where `pnpm seed` leaves `2026-09-16T09:00:00.000Z`. Every row count matched, so it
 * looked like a faithful restore, but the golden EVM figures are computed relative to the anchor:
 * a second `pnpm test` without re-creating the database failed `db-round-trip` and three
 * `cross-tenant` "computes exactly the same numbers" assertions, and `pnpm demo` showed a
 * project anchored eighteen months in the future. Found by the Epic 1 retrospective while
 * verifying F1.
 *
 * Reading the anchor rather than hardcoding one keeps the restore faithful to whatever the
 * operator seeded with, so it cannot drift from `.env.development`'s `FIXTURE_TIME_ANCHOR`.
 *
 * Faithful cuts both ways: a database already carrying a wrong anchor — one left by a build from
 * before this fix — is restored wrongly too, and stays that way until someone runs `pnpm seed`.
 * That is the right trade (the suite must not invent an anchor the operator did not choose), but
 * it is why a stale database keeps failing `db-round-trip` until it is reseeded once.
 */
const foundAnchor = reachable ? await demoAnchor() : undefined;

/** Puts the demo Tenant back exactly as this suite found it. */
async function restoreDemoSeed(): Promise<void> {
  const passwordHash = await hashPassword(process.env.SEED_DEMO_PASSWORD ?? 'demo-password-local');
  const restoreClock = {
    now: () => new Date((foundAnchor ?? FIXTURE_CLOCK_NOW).getTime()),
  };
  await seed(owner(), { demoPasswordHash: passwordHash, clock: restoreClock, profile: 'demo' });
}

afterAll(async () => {
  if (!reachable) return;
  try {
    await removeProbeTenant(owner(), PROBE);
    // Leave the DB on the demo Tenant for local day-to-day — and on the anchor it arrived with,
    // so the next `pnpm test` and the next `pnpm demo` both see what `pnpm seed` produces.
    await restoreDemoSeed();
  } finally {
    try {
      await releaseSeedSuiteLock();
    } finally {
      await closeAllPools();
    }
  }
});

describe.skipIf(!reachable)('seed load orchestration (story 1.8)', () => {
  it(
    'writes 5×500 under profile load, replaces a single other Tenant, refuses two',
    async () => {
      const passwordHash = await hashPassword(
        process.env.SEED_DEMO_PASSWORD ?? 'demo-password-local',
      );

      // One Tenant present (demo or leftover) may be replaced by a different id (ten-load).
      await seed(owner(), { demoPasswordHash: passwordHash, clock, profile: 'load' });

      const projects = await owner().select({ id: schema.project.id }).from(schema.project);
      expect(projects).toHaveLength(LOAD_PROJECT_COUNT);

      const [{ wpCount }] = await owner()
        .select({ wpCount: count() })
        .from(schema.workPackage);
      expect(Number(wpCount)).toBe(LOAD_PROJECT_COUNT * LOAD_WP_PER_PROJECT);

      const [{ resCount }] = await owner()
        .select({ resCount: count() })
        .from(schema.resource);
      expect(Number(resCount)).toBe(24);

      const tenants = await owner().select({ id: schema.tenant.id }).from(schema.tenant);
      expect(tenants.map((t) => t.id)).toEqual(['ten-load']);

      // Story 5.15: the Ticket half — 2,000 per Project, every bk-load-* account linked once.
      const [{ ticketCount }] = await owner().select({ ticketCount: count() }).from(schema.ticket);
      expect(Number(ticketCount)).toBe(LOAD_PROJECT_COUNT * LOAD_TICKETS_PER_PROJECT);
      const [{ linkCount }] = await owner()
        .select({ linkCount: count() })
        .from(schema.trackerAccountLinkEvent);
      expect(Number(linkCount)).toBe(24);

      // Stable per-project index bands (not hash): 1000..1004 for the five load projects.
      const defaultRates = await owner()
        .select({ seq: schema.projectDefaultRateEntry.seq })
        .from(schema.projectDefaultRateEntry)
        .orderBy(asc(schema.projectDefaultRateEntry.seq));
      expect(defaultRates.map((r) => r.seq)).toEqual([1000, 1001, 1002, 1003, 1004]);

      // Switching profile with exactly one Tenant (different id) is allowed.
      await seed(owner(), { demoPasswordHash: passwordHash, clock, profile: 'demo' });
      const afterDemo = await owner().select({ id: schema.tenant.id }).from(schema.tenant);
      expect(afterDemo.map((t) => t.id)).toEqual(['ten-momo']);

      // Two Tenants still refuse.
      await createProbeTenant(owner(), PROBE);
      const both = await owner().select({ id: schema.tenant.id }).from(schema.tenant);
      expect(both.length).toBe(2);
      await expect(
        seed(owner(), { demoPasswordHash: passwordHash, clock, profile: 'load' }),
      ).rejects.toThrow(/Refusing to seed: this database holds 2 Tenants/);
      await removeProbeTenant(owner(), PROBE);
    },
    300_000,
  );

  /**
   * The suite must hand the database back the way it found it, or the NEXT `pnpm test` fails.
   *
   * Row counts are not enough to catch this and were not: a restore stamped with this suite's
   * fixture Clock produced byte-identical counts while `project.demo_anchor` and
   * `baseline_version.recorded_at` moved to 2027-03-01, and the golden EVM figures are computed
   * relative to that anchor. This asserts the timestamps, which is where the damage was.
   */
  it('restores the demo Tenant on the anchor it found, not on this suite Clock', async () => {
    // `foundAnchor`, not a fresh read: the load test above has already reseeded with this
    // suite's Clock by the time this runs, so reading now would measure the damage, not the
    // starting point. The module-level capture is the only value taken before anything wrote.
    const before = foundAnchor;
    expect(before, 'the suite needs a seeded demo Tenant to restore to').toBeInstanceOf(Date);

    // Stamp the damage the old restore used to leave behind.
    const passwordHash = await hashPassword(
      process.env.SEED_DEMO_PASSWORD ?? 'demo-password-local',
    );
    await seed(owner(), { demoPasswordHash: passwordHash, clock, profile: 'demo' });
    expect(
      (await demoAnchor())!.toISOString(),
      'precondition: seeding with this suite Clock moves the anchor',
    ).toBe(FIXTURE_CLOCK_NOW.toISOString());

    await restoreDemoSeed();

    expect((await demoAnchor())!.toISOString(), 'anchor restored').toBe(before!.toISOString());

    // The seed writes no Baseline any more (story 2.1, decision 2-A); the actual-date events are
    // what it still stamps from the Clock besides the anchor.
    const events = await owner()
      .select({ at: schema.wpStatusEvent.at })
      .from(schema.wpStatusEvent);
    expect(events.length, 'the demo seed records its milestones\' actual finishes').toBeGreaterThan(0);
    for (const event of events) {
      expect(event.at.toISOString(), 'actual-date event time restored with it').toBe(
        before!.toISOString(),
      );
    }
  });
});
