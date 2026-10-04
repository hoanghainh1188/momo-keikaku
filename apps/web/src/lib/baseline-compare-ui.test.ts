/**
 * Story 4.4 — Baseline compare panel branches (need-two / form / error caption).
 */
import { describe, expect, it } from 'vitest';
import { baselineComparePanelView } from './baseline-compare-ui';

describe('baselineComparePanelView', () => {
  it('need_two when fewer than two versions (0 or 1)', () => {
    expect(baselineComparePanelView({ versionCount: 0, error: null })).toEqual({
      kind: 'need_two',
    });
    expect(baselineComparePanelView({ versionCount: 1, error: 'ignored' })).toEqual({
      kind: 'need_two',
    });
  });

  it('shows form when versionCount >= 2', () => {
    expect(baselineComparePanelView({ versionCount: 2, error: null })).toEqual({
      kind: 'form',
      error: null,
    });
    expect(baselineComparePanelView({ versionCount: 3, error: null })).toEqual({
      kind: 'form',
      error: null,
    });
  });

  it('carries refuse/error caption on the form branch', () => {
    expect(
      baselineComparePanelView({
        versionCount: 2,
        error: 'Pick two different Baseline versions.',
      }),
    ).toEqual({
      kind: 'form',
      error: 'Pick two different Baseline versions.',
    });
  });
});
