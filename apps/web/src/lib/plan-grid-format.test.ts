/**
 * Story 2.13 — preset persistence + focus-preserving switcher (client helpers).
 * Shared EN formatters are covered under `@momo/domain/present` (Epic 2 retro F2/F5).
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  capturePresetFocusRestore,
  dateInkClassName,
  presetFromDigitKey,
  presetStorageKey,
  readStoredPreset,
  recordedPctDisplay,
  recordedPctWhole,
  recordedPercentToRatio,
  writeStoredPreset,
} from './plan-grid-format';

describe('plan-grid-format (web)', () => {
  const store = new Map<string, string>();

  beforeEach(() => {
    store.clear();
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: {
        localStorage: {
          getItem: (k: string) => store.get(k) ?? null,
          setItem: (k: string, v: string) => {
            store.set(k, v);
          },
          clear: () => store.clear(),
        },
      },
    });
  });

  afterEach(() => {
    Reflect.deleteProperty(globalThis, 'window');
  });

  it('persists Schedule/Progress/Baseline per user+project', () => {
    expect(presetStorageKey('u1', 'p1')).toBe('momo.plan.preset:u1:p1');
    expect(readStoredPreset('u1', 'p1')).toBe('schedule');
    writeStoredPreset('u1', 'p1', 'progress');
    expect(readStoredPreset('u1', 'p1')).toBe('progress');
    writeStoredPreset('u1', 'p1', 'baseline');
    expect(readStoredPreset('u1', 'p1')).toBe('baseline');
    expect(readStoredPreset('u1', 'p2')).toBe('schedule');
  });

  it('keeps recorded % display for the Progress preset', () => {
    expect(recordedPctDisplay(null)).toContain('0%');
  });

  it('applies muted vs full ink classes for dates straddling Data Date', () => {
    expect(dateInkClassName('2026-09-18', '2026-09-19')).toContain('plan-date-muted');
    expect(dateInkClassName('2026-09-19', '2026-09-19')).toContain('plan-date-muted');
    expect(dateInkClassName('2026-09-20', '2026-09-19')).toContain('plan-date-full');
    expect(dateInkClassName('2026-09-20', '2026-09-19')).not.toContain('plan-date-muted');
  });

  it('guards recorded % whole-percent conversion and percent→ratio', () => {
    expect(recordedPctWhole(null)).toBeNull();
    expect(recordedPctWhole({ num: '1', den: '0' })).toBeNull();
    expect(recordedPctWhole({ num: '25', den: '100' })).toBe(25);
    expect(recordedPercentToRatio(25)).toEqual({ num: 25n, den: 100n });
    expect(recordedPercentToRatio(0)).toEqual({ num: 0n, den: 100n });
    expect(recordedPercentToRatio(100)).toEqual({ num: 100n, den: 100n });
    expect(recordedPercentToRatio(-1)).toBeNull();
    expect(recordedPercentToRatio(101)).toBeNull();
    expect(recordedPercentToRatio(12.5)).toBeNull();
  });

  it('keeps focused row id across preset switch and maps keys 1/2/3', () => {
    expect(capturePresetFocusRestore('wp-leaf')).toBe('wp-leaf');
    expect(capturePresetFocusRestore(null)).toBeNull();
    expect(presetFromDigitKey('1')).toBe('schedule');
    expect(presetFromDigitKey('2')).toBe('progress');
    expect(presetFromDigitKey('3')).toBe('baseline');
    expect(presetFromDigitKey('4')).toBeNull();
  });
});
