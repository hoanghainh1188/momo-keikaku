import { afterAll, describe, expect, it } from 'vitest';
import { hours, share } from '@momo/domain';
import { DEMO_TENANT_ID, loadReview } from './repo';
import { closeAllPools, getDb, getPool } from './client';
import { acquireSeedSuiteLock, releaseSeedSuiteLock } from './seed-suite-lock';

/**
 * The persistence round trip.
 *
 * `demo-golden.test.ts` computes the Review straight from the fixture files through
 * the pure domain core, and its header says that a mismatch between it and the screen
 * "means the persistence layer has introduced a difference" — which assumes a human
 * notices. This file removes the human: it runs the same Review through the database
 * (`seed.ts` wrote the rows, drizzle read them back) and asserts the figures are
 * identical to the ones pinned there.
 *
 * EXCEPT WHAT THE BASELINE DECIDES (story 2.2). The seed writes no Baseline until Epic 4 (story
 * 2.1, decision 2-A), so this file pins the NO-BASELINE Review (decision Q1-A): EVM, forecast,
 * milestones and divergence are null, and every mapped hour is non-baselined Unplanned Work.
 * Everything the Baseline does not touch — AC, Opening Balances, Coverage, the Unmapped groups —
 * is still the golden figure, and is asserted as such.
 *
 * That is the only gate covering the ORM, the driver and the server together. Without
 * it a row-mapping regression — a `bigint` column arriving as a string, say — ships
 * with typecheck and the fixture tests both green, and surfaces as wrong money on the
 * Reconciliation Review.
 *
 * The numbers below are deliberately duplicated from `demo-golden.test.ts` rather than
 * imported. Two independent paths asserting the same constants is the whole point; a
 * shared constant would let one path drift and still agree with itself.
 *
 * It connects as the RESTRICTED application role and reads through `withTenant`, which is
 * what story 1.2 changed here. Before that it connected as `momo` — a superuser, for whom
 * FORCE row-level security does nothing — so every figure below would have reproduced
 * whether the policies existed or not. Now the same figures are evidence that the
 * tenant-scoped path returns the whole dataset and not a filtered subset of it: if
 * `withTenant` bound the wrong value, or a policy named the wrong column, these numbers
 * would come back computed over zero rows.
 *
 * Requires a seeded database. Set REQUIRE_DB=1 (CI does) to turn an unreachable
 * database into a failure instead of a skip, so this can never pass by not running.
 */

const REQUIRE_DB = process.env.REQUIRE_DB === '1';
const APP_DATABASE_URL = process.env.APP_DATABASE_URL;

async function databaseReachable(): Promise<boolean> {
  if (!APP_DATABASE_URL) return false;
  try {
    const client = await getPool(APP_DATABASE_URL).connect();
    client.release();
    return true;
  } catch {
    return false;
  }
}

if (REQUIRE_DB && !APP_DATABASE_URL) {
  throw new Error(
    'REQUIRE_DB=1 but APP_DATABASE_URL is not set. This test now reads as the restricted ' +
      'application role — there is no localhost default any more — so it must not be skipped here.',
  );
}

const reachable = await databaseReachable();

if (REQUIRE_DB && !reachable) {
  throw new Error(
    `REQUIRE_DB=1 but the database at ${APP_DATABASE_URL} is unreachable. ` +
      'This test is the only gate on the ORM/driver/server combination, so it must not be skipped here.',
  );
}

// It reads the demo Tenant, which a seed suite TRUNCATEs and rewrites — so it holds the seed-suite
// lock shared, like a probe suite (`seed-suite-lock.ts`). Without it, its `withTenant` read and a
// seed's TRUNCATE took their table locks in opposite orders and Postgres broke the cycle by failing
// the seed (40P01, measured in story 2.1's runs); and a read landing between the TRUNCATE and the
// reseed would see the load profile's Tenant, not the demo's. An advisory lock is database-wide,
// so the application role can take it.
if (reachable) {
  await acquireSeedSuiteLock(APP_DATABASE_URL!, 'shared');
}

afterAll(async () => {
  await releaseSeedSuiteLock();
  if (reachable) await closeAllPools();
});

/** The handle every assertion below reads through: the application role, not the owner. */
const db = () => getDb(APP_DATABASE_URL!);

describe.skipIf(!reachable)('persistence round trip — the database reproduces the golden figures', () => {
  it('pins the Review to the same snapshot and measurement basis', async () => {
    const { review } = await loadReview(db(), DEMO_TENANT_ID);
    expect(review.snapshot.id).toBe('snap-ec-phase2-0006');
    expect(review.measurementBasis).toBe('hours');
  });

  it('returns a no-Baseline Review rather than throwing — EVM, forecast, milestones and divergence are null', async () => {
    // The seed writes no Baseline (story 2.1, decision 2-A), so the Review is partial by design
    // (story 2.2, decision Q1-A). `demo-golden.test.ts` keeps the full EVM figures, computed in
    // memory against the Baseline the fixture carries; this file pins what the database holds.
    const { bundle, review } = await loadReview(db(), DEMO_TENANT_ID);
    expect(bundle.baseline).toBeNull();
    expect(bundle.input.activeBaselineSeq).toBeNull();
    expect(review.evm).toBeNull();
    expect(review.money).toBeNull();
    expect(review.forecast).toBeNull();
    expect(review.milestones).toBeNull();
    expect(review.divergence).toBeNull();
    expect(review.behindPlan).toBe(false);
  });

  it('reports AC, Opening Balances and Coverage exactly as the fixture does', async () => {
    // None of these reads the Baseline, so they are the golden figures unchanged.
    const { review } = await loadReview(db(), DEMO_TENANT_ID);
    expect(hours(review.attribution.cumulative.totalMh)).toBe('1661.5');
    expect(hours(review.openingBalanceMh)).toBe('900.2');
    expect(hours(review.attribution.period.totalMh)).toBe('172.9');
    expect(share(review.coverage.mappedHourShare)).toBe('90.0%');
    expect(share(review.coverage.mappedTicketShare)).toBe('81.0%');
    expect(review.coverage.unmappedTickets).toBe(22);
    expect(review.unmappedGroups.map((g) => [g.label, g.ticketCount, hours(g.mh)])).toEqual([
      ['Bug', 11, '86.7'],
      ['Feature-Request', 6, '46.7'],
      ['Infrastructure', 5, '32.6'],
    ]);
  });

  it('splits Unplanned Work with every mapped hour non-baselined', async () => {
    // Every ledger entry was ingested with no Baseline active, so a mapped hour is judged
    // against no Baseline at all: an hour on an ordinary WP is non-baselined Unplanned Work, and
    // a Catch-all WP's hours are all overflow (its LOE budget is the Baseline's, and there is
    // none). Unmapped Work is the golden 166.0 h, because it never depended on the Baseline.
    const { review } = await loadReview(db(), DEMO_TENANT_ID);
    const by = Object.fromEntries(review.unplanned.components.map((c) => [c.key, hours(c.mh)]));
    expect(by).toEqual({
      unmapped: '166.0',
      'non-baselined': '1364.7',
      'catch-all-overflow': '130.8',
    });
    expect(hours(review.unplanned.cumulative.unplannedMh)).toBe('1661.5');
    expect(Object.fromEntries(review.scopeLedger.map((b) => [b.key, share(b.share)]))).toEqual({
      'mapped-baselined': '0.0%',
      'mapped-non-baselined': '82.1%',
      'catch-all': '0.0%',
      'catch-all-overflow': '7.9%',
      unmapped: '10.0%',
    });
  });

  it('colours every indicator unavailable — the Unplanned share is shown, not judged', async () => {
    const { review } = await loadReview(db(), DEMO_TENANT_ID);
    expect(share(review.unplanned.sharePeriod!)).toBe('100.0%');
    expect(share(review.unplanned.shareCumulative!)).toBe('100.0%');
    expect(hours(review.unplanned.period.unplannedMh)).toBe('172.9');
    expect(review.health.indicators.map((i) => [i.key, i.colour])).toEqual([
      ['schedule', 'unavailable'],
      ['effort_cost', 'unavailable'],
      ['unplanned', 'unavailable'],
    ]);
    expect(review.health.overall).toBe('unavailable');
    expect(review.health.overallNote).toBe('Schedule, Effort/Cost, Unplanned Work unavailable');
  });

  it('reads each WP\'s actual dates from its head status event', async () => {
    // The two milestones the fixture reached; every other WP has no event, so no actual date.
    const { bundle } = await loadReview(db(), DEMO_TENANT_ID);
    const withActuals = bundle.wps
      .filter((w) => w.actualStart !== null || w.actualFinish !== null)
      .map((w) => [w.id, w.isMilestone, w.actualStart, w.actualFinish]);
    expect(withActuals).toEqual([
      ['wp-M1', true, null, '2026-07-13'],
      ['wp-M2', true, null, '2026-08-31'],
    ]);
  });

  it('carries effort across the driver as bigint milli-hours, never strings or doubles', async () => {
    const { bundle, review } = await loadReview(db(), DEMO_TENANT_ID);
    // The regression this file exists to catch. `schema.ts` declares the `*_mh` columns
    // `bigint({ mode: 'bigint' })`, and that mode is what converts Postgres int8 into a JS
    // `bigint` (AD-4) — node-postgres hands back a *string* otherwise, because int8 does not
    // fit a double. A string still renders correctly through `hours()` while silently
    // breaking every comparison and sum upstream of it, which is precisely the failure the
    // assertions above would not catch on their own; a `number` would be exact here but is
    // not the representation AD-4 decided.
    //
    // Values are milli-hours, so 1661.5 h reads as 1661495n here. With no Baseline in the
    // database there is no BAC, PV or EV to carry (story 2.2); AC and the Opening Balances come
    // straight off `actuals_ledger_entry.delta_mh`, and the Current Plan off
    // `work_package.planned_mh`, so those are the int8 columns checked.
    for (const [label, value] of [
      ['AC', review.attribution.cumulative.totalMh],
      ['Opening Balances', review.openingBalanceMh],
      ['Unplanned', review.unplanned.cumulative.unplannedMh],
      ['a Current Plan WP', bundle.wps.find((w) => w.plannedMh > 0n)?.plannedMh],
    ] as const) {
      expect(typeof value, `${label} crossed the driver as ${typeof value}`).toBe('bigint');
    }
    // The integer yen columns are read into bigint too, and money stays integral.
    expect(typeof review.attribution.cumulative.totalJpy).toBe('bigint');
    expect(review.attribution.cumulative.totalMh).toBe(1661495n);
    expect(review.openingBalanceMh).toBe(900_228n);
  });
});
