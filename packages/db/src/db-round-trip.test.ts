import { afterAll, describe, expect, it } from 'vitest';
import { hours, present, share } from '@momo/domain';
import { loadReview } from './repo';
import { DATABASE_URL, getPool } from './client';

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
 * Requires a seeded database. Set REQUIRE_DB=1 (CI does) to turn an unreachable
 * database into a failure instead of a skip, so this can never pass by not running.
 */

const REQUIRE_DB = process.env.REQUIRE_DB === '1';

async function databaseReachable(): Promise<boolean> {
  try {
    const client = await getPool().connect();
    client.release();
    return true;
  } catch {
    return false;
  }
}

const reachable = await databaseReachable();

if (REQUIRE_DB && !reachable) {
  throw new Error(
    `REQUIRE_DB=1 but the database at ${DATABASE_URL} is unreachable. ` +
      'This test is the only gate on the ORM/driver/server combination, so it must not be skipped here.',
  );
}

afterAll(async () => {
  if (reachable) await getPool().end();
});

describe.skipIf(!reachable)('persistence round trip — the database reproduces the golden figures', () => {
  it('pins the Review to the same snapshot and measurement basis', async () => {
    const { review } = await loadReview();
    expect(review.snapshot.id).toBe('snap-ec-phase2-0006');
    expect(review.measurementBasis).toBe('hours');
  });

  it('reports the headline EVM figures in effort hours', async () => {
    const { review } = await loadReview();
    expect(hours(review.evm.bacMh)).toBe('2936.0');
    expect(hours(review.evm.pvMh)).toBe('1459.8');
    expect(hours(review.evm.evMh)).toBe('1330.8');
    expect(hours(review.evm.acMh)).toBe('1661.5');
  });

  it('reports SPI, both CPIs and TCPI', async () => {
    const { review } = await loadReview();
    expect(present(review.evm.spi).text).toBe('0.91');
    expect(present(review.evm.cpiAllIn).text).toBe('0.80');
    expect(present(review.evm.cpiPlannedScope).text).toBe('0.92');
    expect(present(review.evm.tcpi).text).toBe('1.26');
  });

  it('reports the forecast and both finish dates', async () => {
    const { review } = await loadReview();
    expect(present(review.evm.eacMh).text).toBe('3665.6');
    expect(present(review.evm.etcMh).text).toBe('2004.1');
    expect(present(review.evm.vacMh).text).toBe('-729.6');
    expect(review.forecast.forecastFinish).toBe('2026-12-15');
    expect(review.forecast.baselineFinish).toBe('2026-11-27');
  });

  it('splits Unplanned Work into all three components', async () => {
    const { review } = await loadReview();
    const by = Object.fromEntries(review.unplanned.components.map((c) => [c.key, hours(c.mh)]));
    expect(by).toEqual({
      unmapped: '166.0',
      'non-baselined': '0.0',
      'catch-all-overflow': '50.8',
    });
    expect(hours(review.unplanned.cumulative.unplannedMh)).toBe('216.8');
  });

  it('shows Unplanned Work in the amber band for the period', async () => {
    const { review } = await loadReview();
    expect(share(review.unplanned.sharePeriod!)).toBe('16.8%');
    expect(share(review.unplanned.shareCumulative!)).toBe('13.0%');
    expect(hours(review.unplanned.period.unplannedMh)).toBe('29.1');
  });

  it('carries effort across the driver as integral numbers, never strings', async () => {
    const { review } = await loadReview();
    // The regression this file exists to catch. `schema.ts` declares these columns
    // `bigint({ mode: 'number' })`, and that mode is what converts Postgres int8 into
    // a JS number — node-postgres hands back a *string* otherwise, because int8 does
    // not fit a double. A string still renders correctly through `hours()` while
    // silently breaking every comparison and sum upstream of it, which is precisely
    // the failure the assertions above would not catch on their own.
    //
    // Values are milli-hours, so 2936.0 h reads as 2936000 here.
    for (const [label, value] of [
      ['BAC', review.evm.bacMh],
      ['PV', review.evm.pvMh],
      ['EV', review.evm.evMh],
      ['AC', review.evm.acMh],
    ] as const) {
      expect(typeof value, `${label} crossed the driver as ${typeof value}`).toBe('number');
      expect(Number.isInteger(value), `${label} is not integral`).toBe(true);
    }
    expect(review.evm.bacMh).toBe(2936000);
    expect(review.evm.acMh).toBe(1661495);
  });
});
