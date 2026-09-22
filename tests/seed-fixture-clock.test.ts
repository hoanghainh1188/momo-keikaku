/**
 * Story 1.8 matrix: seed under fixture Clock, and reseed seq stability without
 * `RESTART IDENTITY`. Probe seq base ≥ 870_000_000.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { closeAllPools, getDb } from '../packages/db/src/client';
import { buildDemoState } from '../packages/db/src/fixtures';
import {
  assertProbeTenantsDisjoint,
  buildProbeTenant,
  removeProbeTenant,
} from '../packages/db/src/probe-tenants';
import * as schema from '../packages/db/src/schema';
import { writeTenantRows } from '../packages/db/src/seed';
import { withTenant } from '../packages/db/src/with-tenant';
import { connectWriteHarness, owner } from './write-harness';

const reachable = await connectWriteHarness({
  ownerUrl: process.env.DATABASE_URL,
  appUrl: process.env.APP_DATABASE_URL,
  requireDb: process.env.REQUIRE_DB === '1',
});

/** Story 1.8 continuity: load-fixture probes use ≥ 870_000_000. */
const PROBE = buildProbeTenant('xtprobe-s8c', 870_000_000);
assertProbeTenantsDisjoint([PROBE]);

/** Shared with seed-load-orchestration — serialise TRUNCATE against the owner DB. */
const SEED_SUITE_LOCK = 8_700_000_018;

/** Distinct from the demo fixture anchor (`2026-09-16T09:00:00.000Z`) and Baseline recordedAt. */
const FIXTURE_CLOCK_NOW = new Date('2027-03-01T15:30:00.000Z');
const fixtureClock = { now: () => new Date(FIXTURE_CLOCK_NOW.getTime()) };

const expectedBaselineSeq = 1 + PROBE.writeOptions.seqOffset;

async function advanceBaselineIdentity(past: number): Promise<void> {
  await owner().execute(
    sql`SELECT setval(pg_get_serial_sequence('baseline_version', 'seq'), ${past}, true)`,
  );
}

async function writeProbeWithClock(): Promise<void> {
  await removeProbeTenant(owner(), PROBE);
  await withTenant(owner(), PROBE.tenantId, (tx) =>
    writeTenantRows(tx, PROBE.state, { ...PROBE.writeOptions, clock: fixtureClock }),
  );
}

beforeAll(async () => {
  if (!reachable) return;
  await owner().execute(sql`SELECT pg_advisory_lock(${SEED_SUITE_LOCK})`);
});

afterAll(async () => {
  if (!reachable) return;
  try {
    await removeProbeTenant(owner(), PROBE);
  } finally {
    try {
      await owner().execute(sql`SELECT pg_advisory_unlock(${SEED_SUITE_LOCK})`);
    } finally {
      await closeAllPools();
    }
  }
});

describe.skipIf(!reachable)('seed under fixture Clock (story 1.8 matrix)', () => {
  it('stamps demo_anchor and Baseline recordedAt from the Clock; Rates keep 2026-01-01 coverage', async () => {
    await advanceBaselineIdentity(99_000_000);
    await writeProbeWithClock();

    const [project] = await withTenant(owner(), PROBE.tenantId, (tx) =>
      tx
        .select({
          demoAnchor: schema.project.demoAnchor,
        })
        .from(schema.project)
        .where(eq(schema.project.id, PROBE.projectId)),
    );
    expect(project?.demoAnchor.toISOString()).toBe(FIXTURE_CLOCK_NOW.toISOString());

    const [baseline] = await withTenant(owner(), PROBE.tenantId, (tx) =>
      tx
        .select({
          seq: schema.baselineVersion.seq,
          recordedAt: schema.baselineVersion.recordedAt,
        })
        .from(schema.baselineVersion)
        .where(eq(schema.baselineVersion.projectId, PROBE.projectId)),
    );
    expect(baseline?.recordedAt.toISOString()).toBe(FIXTURE_CLOCK_NOW.toISOString());
    // Not the fixture JSON's recordedAt (preserved as 2026-06-05… on the demo path).
    expect(baseline?.recordedAt.toISOString()).not.toBe(
      buildDemoState().fixture.baseline.recordedAt,
    );

    const rates = await withTenant(owner(), PROBE.tenantId, (tx) =>
      tx
        .select({ effectiveFrom: schema.rateEntry.effectiveFrom })
        .from(schema.rateEntry)
        .where(eq(schema.rateEntry.tenantId, PROBE.tenantId)),
    );
    expect(rates.length).toBeGreaterThan(0);
    for (const row of rates) {
      // Rate effectiveFrom stays the fixture origin; Clock stamps demo_anchor / Baseline / audit.
      expect(row.effectiveFrom).toBe('2026-01-01');
    }

    const [projectDefault] = await withTenant(owner(), PROBE.tenantId, (tx) =>
      tx
        .select({ effectiveFrom: schema.projectDefaultRateEntry.effectiveFrom })
        .from(schema.projectDefaultRateEntry)
        .where(eq(schema.projectDefaultRateEntry.projectId, PROBE.projectId)),
    );
    expect(projectDefault?.effectiveFrom).toBe('2026-01-01');
  }, 120_000);
});

describe.skipIf(!reachable)('reseed seq stability without RESTART IDENTITY (story 1.8 matrix)', () => {
  it('keeps fixture-relative baseline seq and ledger mapping after identity was advanced', async () => {
    await advanceBaselineIdentity(99_000_000);
    await writeProbeWithClock();

    const [baseline] = await withTenant(owner(), PROBE.tenantId, (tx) =>
      tx
        .select({ seq: schema.baselineVersion.seq })
        .from(schema.baselineVersion)
        .where(eq(schema.baselineVersion.projectId, PROBE.projectId)),
    );
    expect(baseline?.seq).toBe(expectedBaselineSeq);
    // Not the nextval that would follow setval(99_000_000) without OVERRIDING.
    expect(baseline?.seq).not.toBe(99_000_001);
    expect(baseline?.seq).not.toBe(99_500_001);

    const ledger = await withTenant(owner(), PROBE.tenantId, (tx) =>
      tx
        .select({
          activeBaselineVersionSeq: schema.actualsLedgerEntry.activeBaselineVersionSeq,
        })
        .from(schema.actualsLedgerEntry)
        .where(eq(schema.actualsLedgerEntry.tenantId, PROBE.tenantId))
        .limit(20),
    );
    expect(ledger.length).toBeGreaterThan(0);
    for (const row of ledger) {
      if (row.activeBaselineVersionSeq !== null) {
        expect(row.activeBaselineVersionSeq).toBe(expectedBaselineSeq);
      }
    }

    // Reseed after delete (sequences stay advanced — no RESTART IDENTITY).
    await advanceBaselineIdentity(99_500_000);
    await writeProbeWithClock();

    const [again] = await withTenant(owner(), PROBE.tenantId, (tx) =>
      tx
        .select({ seq: schema.baselineVersion.seq })
        .from(schema.baselineVersion)
        .where(eq(schema.baselineVersion.projectId, PROBE.projectId)),
    );
    expect(again?.seq).toBe(expectedBaselineSeq);

    const ledgerAgain = await withTenant(owner(), PROBE.tenantId, (tx) =>
      tx
        .select({
          activeBaselineVersionSeq: schema.actualsLedgerEntry.activeBaselineVersionSeq,
        })
        .from(schema.actualsLedgerEntry)
        .where(eq(schema.actualsLedgerEntry.tenantId, PROBE.tenantId))
        .limit(5),
    );
    for (const row of ledgerAgain) {
      if (row.activeBaselineVersionSeq !== null) {
        expect(row.activeBaselineVersionSeq).toBe(expectedBaselineSeq);
      }
    }
  }, 180_000);
});
