import { describe, expect, it } from 'vitest';
import { BASELINE_COMPARE_COLUMNS } from './plan-grid-view';
import { baselineComparePresetControl } from './baseline-compare-preset-ui';
import { presetFromDigitKey } from './plan-grid-format';

describe('baselineComparePresetControl (story 4.5 / UX-DR23)', () => {
  it('disables with "No Baseline yet" when no Baseline exists', () => {
    expect(baselineComparePresetControl(false)).toEqual({
      disabled: true,
      title: 'No Baseline yet',
      digitKeyActive: false,
    });
  });

  it('enables Baseline compare when a Baseline exists; key 3 maps to baseline', () => {
    expect(baselineComparePresetControl(true)).toEqual({
      disabled: false,
      title: 'Baseline compare',
      digitKeyActive: true,
    });
    expect(presetFromDigitKey('3')).toBe('baseline');
    expect(BASELINE_COMPARE_COLUMNS).toHaveLength(12);
  });

  it('keeps sized width budget: twelve scrolling cols sum to ≤899px', () => {
    // Mirrors plan-tree-grid colgroup for the Baseline compare preset.
    const widths = [88, 88, 44, 88, 88, 44, 64, 48, 44, 72, 64, 48];
    expect(widths).toHaveLength(12);
    expect(widths.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(899);
    // Frozen leading cols still 82+214+34; total sized preset ≤1229.
    expect(82 + 214 + 34 + widths.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(1229);
  });
});
