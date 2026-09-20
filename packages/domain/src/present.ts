import type { Metric } from './units';
import { mhToHours } from './units';

/**
 * AD-4: the ONLY rounding site, for both the UI and export outputs.
 * Ratios to 2 decimals, hours to 1 decimal, yen to integer.
 */
export const ratio = (x: number): string => x.toFixed(2);
export const hours = (mh: number): string => mhToHours(mh).toFixed(1);
export const hoursSigned = (mh: number): string => (mh > 0 ? '+' : '') + mhToHours(mh).toFixed(1);
export const yen = (jpy: number): string => `¥${Math.round(jpy).toLocaleString('en-US')}`;
export const share = (x: number): string => `${(x * 100).toFixed(1)}%`;

export interface PresentedMetric {
  text: string;
  unit: string | null;
  unavailableReason: string | null;
}

const REASONS: Record<string, string> = {
  tracker_provides_no_hours: 'unavailable — tracker provides no hours',
  no_actuals_yet: 'unavailable — no actual hours yet',
  no_planned_value_yet: 'unavailable — no planned value yet',
  no_cpi_yet: 'unavailable — CPI not computable yet',
  bac_exhausted: 'BAC exhausted',
};

/** FR-27: unavailable metrics render as an em dash plus the reason, never "0". */
export function present(m: Metric): PresentedMetric {
  if (m.kind === 'unavailable') {
    return { text: '—', unit: null, unavailableReason: REASONS[m.reasonCode] ?? m.reasonCode };
  }
  switch (m.unit) {
    case 'ratio':
      return { text: ratio(m.value), unit: null, unavailableReason: null };
    case 'mh':
      return { text: hours(m.value), unit: 'h', unavailableReason: null };
    case 'jpy':
      return { text: yen(m.value), unit: null, unavailableReason: null };
    default:
      return { text: String(m.value), unit: null, unavailableReason: null };
  }
}
