import { describe, expect, it } from 'vitest';
import {
  BASELINE_COMPARE_COLUMNS,
  BASELINE_COMPARE_WIDTHS,
} from './plan-grid-view';
import {
  baselineComparePresetControl,
  resolvePlanPreset,
} from './baseline-compare-preset-ui';
import { presetFromDigitKey } from './plan-grid-format';

describe('baselineComparePresetControl (story 4.5 / UX-DR23)', () => {
  it('disables with "No Baseline yet" when no Baseline exists', () => {
    expect(baselineComparePresetControl(false)).toEqual({
      disabled: true,
      title: 'No Baseline yet',
    });
  });

  it('enables Baseline compare when a Baseline exists; key 3 maps to baseline', () => {
    expect(baselineComparePresetControl(true)).toEqual({
      disabled: false,
      title: 'Baseline compare',
    });
    expect(presetFromDigitKey('3')).toBe('baseline');
    expect(BASELINE_COMPARE_COLUMNS).toHaveLength(12);
  });

  it('keeps sized width budget: twelve scrolling cols sum to ≤899px', () => {
    expect(BASELINE_COMPARE_WIDTHS).toHaveLength(12);
    expect(BASELINE_COMPARE_WIDTHS.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(899);
    // Frozen leading cols still 82+214+34; total sized preset ≤1229.
    expect(
      82 + 214 + 34 + BASELINE_COMPARE_WIDTHS.reduce((a, b) => a + b, 0),
    ).toBeLessThanOrEqual(1229);
  });
});

describe('resolvePlanPreset (story 4.5 / UX-DR23)', () => {
  it('activate: no Baseline → key/click baseline is a no-op (null)', () => {
    expect(resolvePlanPreset('baseline', false, 'activate')).toBeNull();
    expect(resolvePlanPreset('schedule', false, 'activate')).toBe('schedule');
    expect(resolvePlanPreset('progress', false, 'activate')).toBe('progress');
  });

  it('activate: with Baseline → baseline is allowed', () => {
    expect(resolvePlanPreset('baseline', true, 'activate')).toBe('baseline');
  });

  it('restore: stored baseline without Baseline falls back to schedule', () => {
    expect(resolvePlanPreset('baseline', false, 'restore')).toBe('schedule');
    expect(resolvePlanPreset('baseline', true, 'restore')).toBe('baseline');
    expect(resolvePlanPreset('progress', false, 'restore')).toBe('progress');
  });
});
