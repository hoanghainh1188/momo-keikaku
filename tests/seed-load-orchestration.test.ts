/**
 * Story 1.8: `seed({ profile: 'load' })` orchestration and `assertSingleTenantDatabase`.
 * Under REQUIRE_DB (via write harness), exercises the real truncate/replace path.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { asc, count, sql } from 'drizzle-orm';
import { hashPassword } from '../packages/db/auth/src/password';
import { closeAllPools } from '../packages/db/src/client';
import {
  LOAD_PROJECT_COUNT,
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
import { connectWriteHarness, owner } from './write-harness';

const reachable = await connectWriteHarness({
  ownerUrl: process.env.DATABASE_URL,
  appUrl: process.env.APP_DATABASE_URL,
  requireDb: process.env.REQUIRE_DB === '1',
});

const PROBE = buildProbeTenant('xtprobe-s8l', 880_000_000);
assertProbeTenantsDisjoint([PROBE]);

/** Shared with seed-fixture-clock — serialise TRUNCATE against the owner DB. */
const SEED_SUITE_LOCK = 8_700_000_018;

const FIXTURE_CLOCK_NOW = new Date('2027-03-01T15:30:00.000Z');
const clock = { now: () => new Date(FIXTURE_CLOCK_NOW.getTime()) };

beforeAll(async () => {
  if (!reachable) return;
  await owner().execute(sql`SELECT pg_advisory_lock(${SEED_SUITE_LOCK})`);
});

afterAll(async () => {
  if (!reachable) return;
  try {
    await removeProbeTenant(owner(), PROBE);
    // Leave the DB on the demo Tenant for local day-to-day.
    const passwordHash = await hashPassword(
      process.env.SEED_DEMO_PASSWORD ?? 'demo-password-local',
    );
    await seed(owner(), { demoPasswordHash: passwordHash, clock, profile: 'demo' });
  } finally {
    try {
      await owner().execute(sql`SELECT pg_advisory_unlock(${SEED_SUITE_LOCK})`);
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
});
