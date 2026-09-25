/**
 * Story 2.13 — preset persistence + focus-preserving switcher (client helpers).
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  formatFloatDisplay,
  formatPlanDate,
  inkTone,
  presetStorageKey,
  readStoredPreset,
  recordedPctDisplay,
  writeStoredPreset,
  SUMMARY_NA_LABEL,
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

  it('persists Schedule/Progress per user+project', () => {
    expect(presetStorageKey('u1', 'p1')).toBe('momo.plan.preset:u1:p1');
    expect(readStoredPreset('u1', 'p1')).toBe('schedule');
    writeStoredPreset('u1', 'p1', 'progress');
    expect(readStoredPreset('u1', 'p1')).toBe('progress');
    expect(readStoredPreset('u1', 'p2')).toBe('schedule');
  });

  it('mirrors ink / float / date / summary helpers', () => {
    expect(formatPlanDate('2026-03-02')).toBe('2 Mar 2026');
    expect(inkTone('2026-10-01', '2026-09-19')).toBe('full');
    expect(formatFloatDisplay(-5, false).negative).toBe(true);
    expect(recordedPctDisplay(null)).toContain('0%');
    expect(SUMMARY_NA_LABEL).toContain('rolled up');
  });
});
