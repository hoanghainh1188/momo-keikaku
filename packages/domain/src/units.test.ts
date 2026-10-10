import { describe, expect, it } from 'vitest';
import { compareRatio, isBehindPlan } from './health';
import {
  allocateLargestRemainder,
  ceilDiv,
  costOf,
  divRoundHalfEven,
  hoursToMh,
  ratio,
  ratioValue,
  reduce,
  unavailable,
} from './units';

describe('Ratio (AD-4: exact, unreduced)', () => {
  it('is carried exactly as given, and reduced only by an explicit reduce()', () => {
    expect(ratio(3n, 9n)).toEqual({ num: 3n, den: 9n });
    expect(reduce(ratio(3n, 9n))).toEqual({ num: 1n, den: 3n });
    expect(reduce(ratio(6n, -4n))).toEqual({ num: -3n, den: 2n });
    expect(reduce(ratio(0n, 7n))).toEqual({ num: 0n, den: 1n });
  });

  it('refuses a zero denominator, so "unavailable" is decided before a ratio exists', () => {
    expect(() => ratio(1n, 0n)).toThrow(/zero denominator/);
  });
});

describe('compareRatio (the one comparison site)', () => {
  it('compares by cross-multiplication, whatever the scale or sign of either side', () => {
    expect(compareRatio(ratio(95n, 100n), { num: 95n, den: 100n })).toBe(0);
    expect(compareRatio(ratio(2850n, 3000n), { num: 95n, den: 100n })).toBe(0);
    expect(compareRatio(ratio(-19n, -20n), { num: 95n, den: 100n })).toBe(0);
    expect(compareRatio(ratio(94n, 100n), { num: 95n, den: 100n })).toBe(-1);
    expect(compareRatio(ratio(96n, 100n), { num: 95n, den: 100n })).toBe(1);
    expect(compareRatio(ratio(1n, -2n), { num: 0n, den: 1n })).toBe(-1);
  });
});

describe('isBehindPlan (SPI strictly below 1, compared exactly)', () => {
  it('is false at exactly 1, however written, and for an unavailable SPI', () => {
    expect(isBehindPlan(ratioValue(ratio(1n, 1n)))).toBe(false);
    expect(isBehindPlan(ratioValue(ratio(1000n, 1000n)))).toBe(false);
    expect(isBehindPlan(unavailable('no_planned_value_yet'))).toBe(false);
  });

  it('is true below 1, including one that presents as 1.00 and a negative denominator', () => {
    expect(isBehindPlan(ratioValue(ratio(995n, 1000n)))).toBe(true);
    expect(isBehindPlan(ratioValue(ratio(-99n, -100n)))).toBe(true);
  });
});

describe('the two sanctioned integer steps', () => {
  it('divRoundHalfEven rounds to the nearest integer, ties to even, for every sign', () => {
    expect([5n, 7n, 9n, 11n].map((n) => divRoundHalfEven(n, 2n))).toEqual([2n, 4n, 4n, 6n]);
    expect([-5n, -7n].map((n) => divRoundHalfEven(n, 2n))).toEqual([-2n, -4n]);
    expect(divRoundHalfEven(5n, -2n)).toBe(-2n);
    expect(divRoundHalfEven(10n, 3n)).toBe(3n);
    expect(divRoundHalfEven(11n, 3n)).toBe(4n);
  });

  it('ceilDiv takes the ceiling for every sign', () => {
    expect(ceilDiv(7n, 2n)).toBe(4n);
    expect(ceilDiv(6n, 2n)).toBe(3n);
    expect(ceilDiv(-7n, 2n)).toBe(-3n);
    expect(ceilDiv(7n, -2n)).toBe(-3n);
    expect(ceilDiv(-7n, -2n)).toBe(4n);
  });
});

describe('money (AD-4: hours × Rate, half-even, per entry)', () => {
  it('rounds a half yen to even', () => {
    expect(costOf(1_500n, 3n)).toBe(4n); // 4.5 -> 4
    expect(costOf(2_500n, 3n)).toBe(8n); // 7.5 -> 8
    expect(costOf(1_661_495n, 4000n)).toBe(6_645_980n); // always integral at 4000 JPY/h
  });
});

describe('allocateLargestRemainder (AD-4: equal shares, date then resource tie-break)', () => {
  it('spreads exactly and prefers earlier date, then lower resource id, on ties', () => {
    // 10 mh over 3 day×resource cells → quotient 3, remainder 1 → first by tie-break gets +1
    const cells = [
      { date: '2026-06-02', resourceId: 'r-a' },
      { date: '2026-06-01', resourceId: 'r-b' },
      { date: '2026-06-01', resourceId: 'r-a' },
    ];
    expect(allocateLargestRemainder(10n, cells)).toEqual([3n, 3n, 4n]);
    // Same date: lower resource id wins the remainder
    expect(
      allocateLargestRemainder(5n, [
        { date: '2026-06-01', resourceId: 'r-b' },
        { date: '2026-06-01', resourceId: 'r-a' },
      ]),
    ).toEqual([2n, 3n]);
  });

  it('returns an empty allocation for an empty cell list and a zero total', () => {
    expect(allocateLargestRemainder(0n, [])).toEqual([]);
    expect(() => allocateLargestRemainder(1n, [])).toThrow(/no cells/);
  });
});

describe('hoursToMh', () => {
  it('converts an exact decimal and refuses anything that would need rounding', () => {
    expect(hoursToMh(100)).toBe(100_000n);
    expect(hoursToMh(0.001)).toBe(1n);
    expect(hoursToMh('-25.5')).toBe(-25_500n);
    expect(() => hoursToMh(0.0005)).toThrow(RangeError);
    expect(() => hoursToMh(Number.NaN)).toThrow(RangeError);
    expect(() => hoursToMh(2 ** 53)).toThrow(RangeError); // already rounded by the double
    expect(hoursToMh('9007199254740993')).toBe(9_007_199_254_740_993_000n);
  });
});
