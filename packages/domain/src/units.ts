/**
 * Effort is carried as integer milli-hours (mh). 1h = 1000mh.
 * Money is integer JPY. Rounding happens only in present.ts (AD-4).
 *
 * DEVIATION from ARCHITECTURE-SPINE AD-4: the spine says `bigint`. This demo uses
 * JS integer `number`, which is exact well past any plausible project size
 * (2^53 mh = 9e12 hours). Noted in README-DEMO.md.
 */
export type Mh = number;
export type Jpy = number;

export const H = 1000;
export const hoursToMh = (h: number): Mh => Math.round(h * H);
export const mhToHours = (mh: Mh): number => mh / H;

/** Banker's rounding, so repeated money conversions do not drift. */
export function roundHalfEven(x: number): number {
  const floor = Math.floor(x);
  const diff = x - floor;
  if (diff > 0.5) return floor + 1;
  if (diff < 0.5) return floor;
  return floor % 2 === 0 ? floor : floor + 1;
}

/** AD-4: hours x rate, computed per ledger entry, then summed. */
export function costOf(mh: Mh, yenPerHour: number): Jpy {
  return roundHalfEven((mh * yenPerHour) / H);
}

export function sum(xs: number[]): number {
  let t = 0;
  for (const x of xs) t += x;
  return t;
}

/** FR-27 / AD-8: every metric is total — a value or an explicit unavailability. */
export type Metric =
  | { kind: 'value'; value: number; unit: 'mh' | 'jpy' | 'ratio' | 'count' | 'date' }
  | { kind: 'unavailable'; reasonCode: string };

export const value = (v: number, unit: Metric extends { unit: infer U } ? U : never): Metric =>
  ({ kind: 'value', value: v, unit }) as Metric;
export const unavailable = (reasonCode: string): Metric => ({ kind: 'unavailable', reasonCode });
