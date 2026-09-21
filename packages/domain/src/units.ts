/**
 * AD-4: numbers are exact integers until presentation.
 *
 * Effort is `bigint` milli-hours (mh), 1 h = 1000 mh. Money is `bigint` JPY. A ratio is a
 * `Ratio` of two bigints, carried UNREDUCED — 3/9 stays 3/9 — until something calls
 * `reduce()` on purpose. Counts, dates and minutes stay `number`.
 *
 * Rounding happens only in `present/` (ratios 2 dp, hours 1 dp, yen integer). Outside it there
 * are exactly two sanctioned integer steps, each through one helper here:
 *   - `divRoundHalfEven` for a derived milli-hour quotient that must itself be an integer
 *     (PV, EV, EAC) and for Hours × Rate (`costOf`);
 *   - `ceilDiv` for whole working days (AD-27).
 * Neither is "rounding for display"; both produce stored-shape integers.
 */
export type Mh = bigint;
export type Jpy = bigint;

/** An exact ratio, `num / den`. Never reduced implicitly; `den` is never zero. */
export interface Ratio {
  readonly num: bigint;
  readonly den: bigint;
}

export const H: Mh = 1000n;

/** A ratio, unreduced. Refuses a zero denominator: callers decide "unavailable" before this. */
export function ratio(num: bigint, den: bigint): Ratio {
  if (den === 0n) throw new RangeError(`ratio ${num}/0 has a zero denominator`);
  return { num, den };
}

export const ZERO: Ratio = { num: 0n, den: 1n };
export const ONE: Ratio = { num: 1n, den: 1n };

const abs = (x: bigint): bigint => (x < 0n ? -x : x);

function gcd(a: bigint, b: bigint): bigint {
  let x = abs(a);
  let y = abs(b);
  while (y !== 0n) [x, y] = [y, x % y];
  return x;
}

/** The only way a ratio is ever reduced — explicitly. The sign is carried on `num`. */
export function reduce(r: Ratio): Ratio {
  const g = gcd(r.num, r.den) || 1n;
  const sign = r.den < 0n ? -1n : 1n;
  return { num: (sign * r.num) / g, den: (sign * r.den) / g };
}

/**
 * `n / d` to the nearest integer, ties to even. Exact for every sign combination.
 * One of AD-4's two sanctioned integer steps (see the header).
 */
export function divRoundHalfEven(n: bigint, d: bigint): bigint {
  if (d === 0n) throw new RangeError(`divRoundHalfEven(${n}, 0)`);
  const negative = n < 0n !== d < 0n;
  const an = abs(n);
  const ad = abs(d);
  let q = an / ad;
  const twiceRemainder = 2n * (an % ad);
  if (twiceRemainder > ad || (twiceRemainder === ad && q % 2n === 1n)) q += 1n;
  return negative ? -q : q;
}

/** The ceiling of `n / d`. AD-27's whole-working-days step. */
export function ceilDiv(n: bigint, d: bigint): bigint {
  if (d === 0n) throw new RangeError(`ceilDiv(${n}, 0)`);
  const q = n / d; // truncates toward zero
  const exact = q * d === n;
  return !exact && n < 0n === d < 0n ? q + 1n : q;
}

/**
 * Hours written as an exact decimal (at most three fraction digits) into milli-hours. Refuses
 * anything that would need rounding, so it can never be where precision is lost.
 */
export function hoursToMh(h: number | string): Mh {
  // A number whose integer part is past 2^53 was already rounded before it got here.
  if (typeof h === 'number' && !(Math.abs(h) <= Number.MAX_SAFE_INTEGER)) {
    throw new RangeError(`hoursToMh: ${h} is not exactly representable; pass it as a string`);
  }
  const text = typeof h === 'number' ? String(h) : h.trim();
  const m = /^(-?)(\d+)(?:\.(\d{1,3}))?$/.exec(text);
  if (!m) throw new RangeError(`hoursToMh: ${text} is not an exact hour count to 1/1000 h`);
  const whole = BigInt(m[2]!) * H + BigInt((m[3] ?? '').padEnd(3, '0'));
  return m[1] === '-' ? -whole : whole;
}

/** AD-4: hours × Rate, per ledger entry, then summed — half-even, from the exact product. */
export function costOf(mh: Mh, yenPerHour: Jpy): Jpy {
  return divRoundHalfEven(mh * yenPerHour, H);
}

export function sum(xs: readonly bigint[]): bigint {
  let t = 0n;
  for (const x of xs) t += x;
  return t;
}

export const minBigint = (a: bigint, b: bigint): bigint => (a < b ? a : b);
export const maxBigint = (a: bigint, b: bigint): bigint => (a > b ? a : b);

/** A sort comparator for bigints (`Array.prototype.sort` needs a `number`). */
export const compareBigint = (a: bigint, b: bigint): number => (a < b ? -1 : a > b ? 1 : 0);

/** FR-27 / AD-8: every metric is total — a value or an explicit unavailability. */
export interface Unavailable {
  kind: 'unavailable';
  reasonCode: string;
}
export type MhMetric = { kind: 'value'; value: Mh; unit: 'mh' } | Unavailable;
export type JpyMetric = { kind: 'value'; value: Jpy; unit: 'jpy' } | Unavailable;
export type RatioMetric = { kind: 'value'; value: Ratio; unit: 'ratio' } | Unavailable;
export type CountMetric = { kind: 'value'; value: number; unit: 'count' } | Unavailable;
export type Metric = MhMetric | JpyMetric | RatioMetric | CountMetric;

export const mhValue = (value: Mh): MhMetric => ({ kind: 'value', value, unit: 'mh' });
export const ratioValue = (value: Ratio): RatioMetric => ({ kind: 'value', value, unit: 'ratio' });
export const unavailable = (reasonCode: string): Unavailable => ({ kind: 'unavailable', reasonCode });
