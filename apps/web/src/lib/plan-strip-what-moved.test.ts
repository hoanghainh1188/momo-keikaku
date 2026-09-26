/**
 * Story 2.15 — schedule strip / What-moved helpers (client mirrors).
 */
import { describe, expect, it } from 'vitest';
import {
  formatMinFloat,
  formatPlanDate,
  formatRelativeAgo,
  shortActorName,
  whatMovedDismissKey,
} from './plan-strip-what-moved';

describe('plan-strip-what-moved (story 2.15)', () => {
  it('formats strip dates and min Float', () => {
    expect(formatPlanDate('2027-03-31')).toBe('31 Mar 2027');
    expect(formatMinFloat(4)).toBe('+4');
    expect(formatMinFloat(-3)).toBe('-3');
    expect(formatMinFloat(null)).toBe('—');
  });

  it('attributes other actors with a short name and relative age', () => {
    expect(shortActorName('Hoang Linh')).toBe('Hoang');
    expect(
      formatRelativeAgo('2026-09-26T10:00:00.000Z', Date.parse('2026-09-26T10:03:00.000Z')),
    ).toBe('3 min ago');
  });

  it('keys dismiss persistence per project run', () => {
    expect(whatMovedDismissKey('prj', 12)).toBe('momo.plan.what-moved-dismissed:prj:12');
  });
});
