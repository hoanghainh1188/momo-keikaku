/**
 * Story 2.15 — schedule strip / What-moved helpers (client mirrors).
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  blankDerivedWhilePending,
  formatMinFloat,
  formatPlanDate,
  formatRelativeAgo,
  formatWhatMovedAttribution,
  readWhatMovedDismissed,
  shortActorName,
  whatMovedDismissKey,
  writeWhatMovedDismissed,
} from './plan-strip-what-moved';

describe('plan-strip-what-moved (story 2.15)', () => {
  const store = new Map<string, string>();

  beforeEach(() => {
    store.clear();
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: {
        sessionStorage: {
          getItem: (k: string) => store.get(k) ?? null,
          setItem: (k: string, v: string) => {
            store.set(k, v);
          },
          removeItem: (k: string) => {
            store.delete(k);
          },
          clear: () => store.clear(),
        },
      },
    });
  });

  afterEach(() => {
    Reflect.deleteProperty(globalThis, 'window');
  });

  it('formats strip dates and min Float — null is honest "—"', () => {
    expect(formatPlanDate('2027-03-31')).toBe('31 Mar 2027');
    expect(formatPlanDate(null)).toBe('—');
    expect(formatMinFloat(4)).toBe('+4');
    expect(formatMinFloat(-3)).toBe('-3');
    expect(formatMinFloat(null)).toBe('—');
  });

  it('blanks derived dates with "…" only while pending and a date exists', () => {
    expect(blankDerivedWhilePending(true, '2026-10-01')).toBe(true);
    expect(blankDerivedWhilePending(true, null)).toBe(false);
    expect(blankDerivedWhilePending(false, '2026-10-01')).toBe(false);
    expect(blankDerivedWhilePending(false, null)).toBe(false);
  });

  it('attributes other actors with the exact band copy', () => {
    expect(shortActorName('Hoang Linh')).toBe('Hoang');
    expect(
      formatRelativeAgo('2026-09-26T10:00:00.000Z', Date.parse('2026-09-26T10:03:00.000Z')),
    ).toBe('3 min ago');
    expect(
      formatWhatMovedAttribution({
        currentUserId: 'me',
        actorUserId: 'other',
        actorName: 'Hoang Linh',
        atIso: '2026-09-26T10:00:00.000Z',
        nowMs: Date.parse('2026-09-26T10:03:00.000Z'),
      }),
    ).toBe(' · edited by Hoang, 3 min ago');
    expect(
      formatWhatMovedAttribution({
        currentUserId: 'me',
        actorUserId: 'me',
        actorName: 'Hoang',
        atIso: '2026-09-26T10:00:00.000Z',
        nowMs: Date.parse('2026-09-26T10:03:00.000Z'),
      }),
    ).toBe('');
  });

  it('persists dismiss in sessionStorage until the runSeq key changes', () => {
    expect(whatMovedDismissKey('prj', 12)).toBe('momo.plan.what-moved-dismissed:prj:12');
    expect(readWhatMovedDismissed('prj', 12)).toBe(false);

    writeWhatMovedDismissed('prj', 12);
    expect(store.get('momo.plan.what-moved-dismissed:prj:12')).toBe('1');
    expect(readWhatMovedDismissed('prj', 12)).toBe(true);

    // Next recalc (new runSeq) is a different key — dismiss does not carry over.
    expect(readWhatMovedDismissed('prj', 13)).toBe(false);
    writeWhatMovedDismissed('prj', 13);
    expect(readWhatMovedDismissed('prj', 12)).toBe(true);
    expect(readWhatMovedDismissed('prj', 13)).toBe(true);
  });
});
