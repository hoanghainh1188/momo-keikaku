import { describe, expect, it } from 'vitest';
import { ratio, unavailable, ZERO } from '../units';
import {
  cssPercent,
  earnedProgress,
  hours,
  hoursSigned,
  present,
  ratioText,
  share,
  thresholdText,
  wholePercent,
  yen,
} from './index';

describe('present (AD-4: the only rounding site, from the exact value, half-even)', () => {
  it('renders ratios to 2 dp, ties to even', () => {
    expect(ratioText(ratio(91n, 100n))).toBe('0.91');
    expect(ratioText(ratio(1n, 3n))).toBe('0.33');
    expect(ratioText(ratio(2n, 3n))).toBe('0.67');
    expect(ratioText(ratio(125n, 1000n))).toBe('0.12'); // 0.125 -> 0.12
    expect(ratioText(ratio(135n, 1000n))).toBe('0.14'); // 0.135 -> 0.14
    expect(ratioText(ratio(3n, 9n))).toBe('0.33'); // unreduced input, same figure
  });

  it('renders hours to 1 dp, ties to even, and never "-0.0"', () => {
    expect(hours(2_936_000n)).toBe('2936.0');
    expect(hours(1_661_495n)).toBe('1661.5');
    expect(hours(1_250n)).toBe('1.2');
    expect(hours(1_350n)).toBe('1.4');
    expect(hours(-729_550n)).toBe('-729.6');
    expect(hours(-40n)).toBe('0.0');
    expect(hoursSigned(1_000n)).toBe('+1.0');
    expect(hoursSigned(-1_000n)).toBe('-1.0');
    expect(hoursSigned(0n)).toBe('0.0');
    expect(hoursSigned(40n)).toBe('0.0'); // rounds to zero: no sign
    expect(hoursSigned(-40n)).toBe('0.0');
    expect(hoursSigned(50n)).toBe('0.0'); // 0.05 -> 0.0, ties to even
    expect(hoursSigned(60n)).toBe('+0.1');
  });

  it('renders yen grouped, shares to 1 dp and whole percentages', () => {
    expect(yen(6_645_980n)).toBe('¥6,645,980');
    expect(share(ratio(168n, 1000n))).toBe('16.8%');
    expect(share(ratio(1n, 8n))).toBe('12.5%');
    expect(share(ratio(1n, 16n))).toBe('6.2%'); // 6.25 -> 6.2
    expect(wholePercent(ratio(99n, 100n))).toBe('99');
    expect(wholePercent(ratio(1n, 8n))).toBe('12'); // 12.5 -> 12
  });

  it('renders a threshold constant as its shortest exact decimal', () => {
    expect(thresholdText(ratio(95n, 100n))).toBe('0.95');
    expect(thresholdText(ratio(11n, 10n))).toBe('1.1');
    expect(thresholdText(ratio(2n, 1n))).toBe('2');
    expect(thresholdText(ratio(1n, 3n))).toBe('0.33');
  });

  it('turns a ratio into a float only for layout geometry', () => {
    expect(cssPercent(ratio(1n, 4n))).toBe('25%');
  });

  it('renders an unavailable metric as an em dash and its reason, never 0', () => {
    expect(present(unavailable('no_actuals_yet'))).toEqual({
      text: '—',
      unit: null,
      unavailableReason: 'unavailable — no actual hours yet',
    });
    expect(present({ kind: 'value', value: 2_936_000n, unit: 'mh' }).text).toBe('2936.0');
    expect(present({ kind: 'value', value: ratio(91n, 100n), unit: 'ratio' }).text).toBe('0.91');
  });
});

describe('earnedProgress', () => {
  it('presents a missing ratio exactly as the Plan page rendered `?? ZERO` before', () => {
    expect(earnedProgress(undefined)).toEqual({ fraction: 0, label: '0' });
    expect(earnedProgress(undefined)).toEqual(earnedProgress(ZERO));
  });

  it('presents a ratio as its geometry fraction and whole-percentage label', () => {
    expect(earnedProgress(ratio(3n, 8n))).toEqual({ fraction: 0.375, label: '38' });
  });
});

describe('@momo/domain/present, the one domain module apps/web may import (AD-1)', () => {
  it('exports exactly these runtime values — a new one is a deliberate edit, never a computing helper', async () => {
    // `.dependency-cruiser.cjs` (web-to-domain-present-only) allows pages this file and nothing
    // else, but cannot see what it re-exports: `export { costOf } from '../units'` would hand
    // pages computing code again with the gate green. This list is that gate. The codec is
    // absent on purpose; types are erased and do not appear.
    expect(Object.keys(await import('./index')).sort()).toEqual([
      'cssPercent',
      'earnedProgress',
      'geometryFraction',
      'hours',
      'hoursSigned',
      'present',
      'ratioText',
      'share',
      'thresholdText',
      'wholePercent',
      'yen',
    ]);
  });
});
