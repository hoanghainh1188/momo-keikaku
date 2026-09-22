import { describe, expect, it } from 'vitest';
import { fixtureRelativeSeq } from './seed';

/**
 * Story 1.8: identity `seq` values are fixture-relative so a reseed after leftover probe
 * counters (no `RESTART IDENTITY`) still stamps the same Baseline / Rate / audit seqs the
 * ledger map expects — Actuals are not silently reclassified.
 */
describe('fixtureRelativeSeq', () => {
  it('is fixture value plus the Tenant band offset', () => {
    expect(fixtureRelativeSeq(1, 0)).toBe(1);
    expect(fixtureRelativeSeq(1, 870_000_000)).toBe(870_000_001);
    expect(fixtureRelativeSeq(24, 100)).toBe(124);
  });

  it('builds a multi-baseline map that keeps distinct fixture keys', () => {
    const fixtureSeqs = [1, 2, 5] as const;
    const offset = 870_000_000;
    const map = new Map(
      fixtureSeqs.map((seq) => [seq, fixtureRelativeSeq(seq, offset)] as const),
    );
    expect(map.get(1)).toBe(870_000_001);
    expect(map.get(2)).toBe(870_000_002);
    expect(map.get(5)).toBe(870_000_005);
    // A ledger row recorded against fixture Baseline 2 translates without colliding with 1.
    expect(map.get(2)).not.toBe(map.get(1));
  });
});
