import { divRoundHalfEven, reduce, type Jpy, type Metric, type Mh, type Ratio } from '../units';

/**
 * `@momo/domain/present` is the ONE domain module `apps/web` may import (AD-1, decided
 * 2026-09-21; `.dependency-cruiser.cjs` rule `web-to-domain-present-only`). So it carries the
 * presentation TYPES a page or component names, re-exported as types only — nothing that
 * computes crosses with them. Everything a page used to compute from the domain comes from a
 * use case or from the Review result instead.
 *
 * The codec (`./codec`) is deliberately NOT re-exported here: it is how stored values are
 * written and read, which is not a page's to call. It reaches the rest of the codebase through
 * the `@momo/domain` barrel, which a page may not import.
 */
export type { Jpy, Metric, Mh, Ratio } from '../units';

/**
 * AD-4: the ONLY rounding site, for both the UI and published outputs.
 *
 * Every figure is rounded here, once, from its EXACT value — never from a float — and ties go
 * to even: ratios to 2 decimals, hours to 1 decimal, yen to the integer (yen already are).
 * Nothing outside this directory may call `Math.round`/`floor`/`ceil`/`trunc` or `.toFixed`
 * in `packages/domain`; the lint fence in `eslint.config.js` holds that.
 */

/** Text for an integer count of 10^-dp units: `fixed(-1234n, 1)` is `-123.4`. Never `-0.0`. */
function fixed(units: bigint, dp: number): string {
  const negative = units < 0n;
  const magnitude = negative ? -units : units;
  const scale = 10n ** BigInt(dp);
  const whole = (magnitude / scale).toString();
  const fraction = dp > 0 ? `.${(magnitude % scale).toString().padStart(dp, '0')}` : '';
  return `${negative ? '-' : ''}${whole}${fraction}`;
}

/** A ratio to 2 decimals: 91/100 → `0.91`. */
export const ratioText = (r: Ratio): string => fixed(divRoundHalfEven(r.num * 100n, r.den), 2);

/** Milli-hours as hours to 1 decimal: 1 661 495 mh → `1661.5`. */
export const hours = (mh: Mh): string => fixed(divRoundHalfEven(mh, 100n), 1);

/**
 * As `hours`, with a leading `+` for a quantity that is positive AS PRESENTED — the sign is
 * taken from the rounded tenths, so 40 mh reads `0.0`, like -40 mh, never `+0.0`.
 */
export function hoursSigned(mh: Mh): string {
  const tenths = divRoundHalfEven(mh, 100n);
  return (tenths > 0n ? '+' : '') + fixed(tenths, 1);
}

/**
 * Signed hours Δ for Baseline compare: `+` / real minus `−` / `0.0` / em dash when N/A.
 * Sign follows the rounded tenths (same half-even rule as `hoursSigned`).
 */
export function hoursDeltaSigned(mh: Mh | null | undefined): string {
  if (mh === null || mh === undefined) return '—';
  const tenths = divRoundHalfEven(mh, 100n);
  if (tenths === 0n) return '0.0';
  if (tenths > 0n) return `+${fixed(tenths, 1)}`;
  return `\u2212${fixed(-tenths, 1)}`;
}

/** Yen, grouped: `¥1,234,000`. Money is already integral (AD-4's `costOf`). */
export function yen(jpy: Jpy, locale = 'en-US'): string {
  return `¥${jpy.toLocaleString(locale)}`;
}

/** A share as a percentage to 1 decimal: 168/1000 → `16.8%`. */
export const share = (r: Ratio): string => `${fixed(divRoundHalfEven(r.num * 1000n, r.den), 1)}%`;

/** A share as a whole percentage, WITHOUT the sign: 3/8 → `38`. */
export const wholePercent = (r: Ratio): string => fixed(divRoundHalfEven(r.num * 100n, r.den), 0);

/**
 * A threshold constant as the shortest exact decimal: 95/100 → `0.95`, 11/10 → `1.1`. A ratio
 * with no terminating decimal falls back to `ratioText`.
 */
export function thresholdText(r: Ratio): string {
  const { num, den } = reduce(r);
  for (let dp = 0; dp <= 18; dp += 1) {
    const scale = 10n ** BigInt(dp);
    if (scale % den === 0n) {
      const text = fixed((num * scale) / den, dp);
      return dp === 0 ? text : text.replace(/\.?0+$/, '');
    }
  }
  return ratioText(r);
}

/**
 * A ratio as a JS number, for LAYOUT GEOMETRY ONLY (a bar's width). It is the
 * one place a ratio becomes a float, and no figure a person reads is ever derived from it.
 */
export const geometryFraction = (r: Ratio): number => Number(r.num) / Number(r.den);

/** A ratio as a CSS percentage length, for layout geometry only (see `geometryFraction`). */
export const cssPercent = (r: Ratio): string => `${geometryFraction(r) * 100}%`;

export interface PresentedMetric {
  text: string;
  unit: string | null;
  unavailableReason: string | null;
  /** Story 5.7: coverage caption when the value covers only part of the Project. */
  coverage: string | null;
}

const REASONS: Record<string, string> = {
  tracker_provides_no_hours: 'unavailable — tracker provides no hours',
  no_actuals_yet: 'unavailable — no actual hours yet',
  no_planned_value_yet: 'unavailable — no planned value yet',
  no_cpi_yet: 'unavailable — CPI not computable yet',
  bac_exhausted: 'BAC exhausted',
  no_hours: 'unavailable — no hours',
  project_younger_than_14_days: 'unavailable — Project younger than 14 days',
  no_project_start: 'unavailable — Project start not set',
};

/** FR-27: unavailable metrics render as an em dash plus the reason, never "0". */
export function present(m: Metric): PresentedMetric {
  if (m.kind === 'unavailable') {
    return {
      text: '—',
      unit: null,
      unavailableReason: REASONS[m.reasonCode] ?? m.reasonCode,
      coverage: null,
    };
  }
  const coverage = m.coverage;
  switch (m.unit) {
    case 'ratio':
      return { text: ratioText(m.value), unit: null, unavailableReason: null, coverage };
    case 'mh':
      return { text: hours(m.value), unit: 'h', unavailableReason: null, coverage };
    case 'jpy':
      return { text: yen(m.value), unit: null, unavailableReason: null, coverage };
    case 'count':
      return { text: String(m.value), unit: null, unavailableReason: null, coverage };
  }
}

export {
  SUMMARY_NA_LABEL,
  formatPlanDate,
  formatPlanDateShort,
  formatPlanDateLong,
  formatMinFloat,
  inkTone,
  formatFloatDisplay,
  daysSigned,
} from './plan-display';

