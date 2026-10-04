import { describe, expect, it } from 'vitest';
import { ratio, unavailable } from '../units';
import {
  cssPercent,
  formatFloatDisplay,
  formatMinFloat,
  formatPlanDate,
  formatPlanDateLong,
  formatPlanDateShort,
  daysSigned,
  hours,
  hoursDeltaSigned,
  hoursSigned,
  inkTone,
  present,
  ratioText,
  share,
  SUMMARY_NA_LABEL,
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
    expect(hoursDeltaSigned(1_000n)).toBe('+1.0');
    expect(hoursDeltaSigned(-1_000n)).toBe('\u22121.0');
    expect(hoursDeltaSigned(0n)).toBe('0.0');
    expect(hoursDeltaSigned(null)).toBe('—');
    expect(daysSigned(3)).toBe('+3');
    expect(daysSigned(-2)).toBe('\u22122');
    expect(daysSigned(0)).toBe('0');
    expect(daysSigned(null)).toBe('—');
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

describe('@momo/domain/present, the one domain module apps/web may import (AD-1)', () => {
  it('exports exactly these runtime values — a new one is a deliberate edit, never a computing helper', async () => {
    // `.dependency-cruiser.cjs` (web-to-domain-present-only) allows pages this file and nothing
    // else, but cannot see what it re-exports: `export { costOf } from '../units'` would hand
    // pages computing code again with the gate green. This list is that gate. The codec is
    // absent on purpose; types are erased and do not appear.
    expect(Object.keys(await import('./index')).sort()).toEqual([
      'SUMMARY_NA_LABEL',
      'cssPercent',
      'daysSigned',
      'formatFloatDisplay',
      'formatMinFloat',
      'formatPlanDate',
      'formatPlanDateLong',
      'formatPlanDateShort',
      'geometryFraction',
      'hours',
      'hoursDeltaSigned',
      'hoursSigned',
      'inkTone',
      'present',
      'ratioText',
      'share',
      'thresholdText',
      'wholePercent',
      'yen',
    ]);
  });
});

describe('plan-display helpers (Epic 2 retro F2/F5)', () => {
  it('formats EN plan dates — happy, null, short, long', () => {
    expect(formatPlanDate('2026-09-19')).toBe('19 Sep 2026');
    expect(formatPlanDate(null)).toBe('—');
    expect(formatPlanDateShort('2026-09-19')).toBe('19 Sep');
    expect(formatPlanDateLong('2027-03-26')).toBe('26 March 2027');
  });

  it('formats min Float and Float display with signed / NA rules', () => {
    expect(formatMinFloat(4)).toBe('+4');
    expect(formatMinFloat(null)).toBe('—');
    expect(formatFloatDisplay(4, false)).toEqual({ text: '+4', negative: false });
    expect(formatFloatDisplay(-3, false)).toEqual({ text: '-3', negative: true });
    expect(formatFloatDisplay(0, false)).toEqual({ text: '0', negative: false });
    expect(formatFloatDisplay(-1, true)).toEqual({ text: '—', negative: false });
    expect(formatFloatDisplay(null, false)).toEqual({ text: '—', negative: false });
  });

  it('splits Data Date ink muted / full / na', () => {
    expect(inkTone('2026-09-19', '2026-09-19')).toBe('muted');
    expect(inkTone('2026-09-18', '2026-09-19')).toBe('muted');
    expect(inkTone('2026-09-20', '2026-09-19')).toBe('full');
    expect(inkTone(null, '2026-09-19')).toBe('na');
    expect(inkTone('2026-09-20', null)).toBe('full');
  });

  it('keeps SUMMARY_NA_LABEL aria string', () => {
    expect(SUMMARY_NA_LABEL).toBe(
      'not applicable — summary work package, rolled up from its children',
    );
  });
});
