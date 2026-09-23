import { afterAll, describe, expect, it } from 'vitest';
import { hours, present, share } from '@momo/domain';
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

  it('reports the headline EVM figures in effort hours', async () => {
    const { review } = await loadReview(db(), DEMO_TENANT_ID);
    expect(hours(review.evm.bacMh)).toBe('2936.0');
    expect(hours(review.evm.pvMh)).toBe('1459.8');
    expect(hours(review.evm.evMh)).toBe('1330.8');
    expect(hours(review.evm.acMh)).toBe('1661.5');
  });

  it('reports SPI, both CPIs and TCPI', async () => {
    const { review } = await loadReview(db(), DEMO_TENANT_ID);
    expect(present(review.evm.spi).text).toBe('0.91');
    expect(present(review.evm.cpiAllIn).text).toBe('0.80');
    expect(present(review.evm.cpiPlannedScope).text).toBe('0.92');
    expect(present(review.evm.tcpi).text).toBe('1.26');
  });

  it('reports the forecast and both finish dates', async () => {
    const { review } = await loadReview(db(), DEMO_TENANT_ID);
    expect(present(review.evm.eacMh).text).toBe('3665.6');
    expect(present(review.evm.etcMh).text).toBe('2004.1');
    expect(present(review.evm.vacMh).text).toBe('-729.6');
    expect(review.forecast.forecastFinish).toBe('2026-12-15');
    expect(review.forecast.baselineFinish).toBe('2026-11-27');
  });

  it('splits Unplanned Work into all three components', async () => {
    const { review } = await loadReview(db(), DEMO_TENANT_ID);
    const by = Object.fromEntries(review.unplanned.components.map((c) => [c.key, hours(c.mh)]));
    expect(by).toEqual({
      unmapped: '166.0',
      'non-baselined': '0.0',
      'catch-all-overflow': '50.8',
    });
    expect(hours(review.unplanned.cumulative.unplannedMh)).toBe('216.8');
  });

  it('shows Unplanned Work in the amber band for the period', async () => {
    const { review } = await loadReview(db(), DEMO_TENANT_ID);
    expect(share(review.unplanned.sharePeriod!)).toBe('16.8%');
    expect(share(review.unplanned.shareCumulative!)).toBe('13.0%');
    expect(hours(review.unplanned.period.unplannedMh)).toBe('29.1');
  });

  it('carries effort across the driver as bigint milli-hours, never strings or doubles', async () => {
    const { review } = await loadReview(db(), DEMO_TENANT_ID);
    // The regression this file exists to catch. `schema.ts` declares the `*_mh` columns
    // `bigint({ mode: 'bigint' })`, and that mode is what converts Postgres int8 into a JS
    // `bigint` (AD-4) — node-postgres hands back a *string* otherwise, because int8 does not
    // fit a double. A string still renders correctly through `hours()` while silently
    // breaking every comparison and sum upstream of it, which is precisely the failure the
    // assertions above would not catch on their own; a `number` would be exact here but is
    // not the representation AD-4 decided.
    //
    // Values are milli-hours, so 2936.0 h reads as 2936000n here.
    for (const [label, value] of [
      ['BAC', review.evm.bacMh],
      ['PV', review.evm.pvMh],
      ['EV', review.evm.evMh],
      ['AC', review.evm.acMh],
    ] as const) {
      expect(typeof value, `${label} crossed the driver as ${typeof value}`).toBe('bigint');
    }
    // The integer yen columns are read into bigint too, and money stays integral.
    expect(typeof review.attribution.cumulative.totalJpy).toBe('bigint');
    expect(review.evm.bacMh).toBe(2936000n);
    expect(review.evm.acMh).toBe(1661495n);
  });
});
