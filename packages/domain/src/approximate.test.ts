import { describe, expect, it } from 'vitest';
import { APPROXIMATE_REASONS, approximate, type Approximated } from './approximate';
import { hoursToMh } from './units';

describe('Approximated<T> (story 5.14 / FR-26: the label lives on the domain output)', () => {
  const rows = [
    { day: '2026-09-15', mh: hoursToMh(3) },
    { day: '2026-09-16', mh: hoursToMh(5) },
  ];

  it('wraps the data in an envelope carrying approximate: true and a domain reason code', () => {
    const out = approximate('hours_spread_between_snapshots', rows);
    expect(out).toEqual({ approximate: true, reasonCode: 'hours_spread_between_snapshots', data: rows });
    expect(out.data).toBe(rows);
  });

  it('freezes the envelope, so the label cannot be stripped or rewritten in place', () => {
    const out = approximate('hours_spread_between_snapshots', rows);
    expect(Object.isFrozen(out)).toBe(true);
    expect(() => {
      (out as { approximate: boolean }).approximate = false;
    }).toThrow(TypeError);
  });

  it('keeps the label when the data is reshaped — it is an envelope, not an intersection', () => {
    const out = approximate('hours_spread_between_snapshots', rows);
    const mapped: Approximated<string[]> = { ...out, data: out.data.map((r) => r.day) };
    expect(mapped.approximate).toBe(true);
    expect(mapped.reasonCode).toBe('hours_spread_between_snapshots');
  });

  it('has a closed reason set', () => {
    expect(APPROXIMATE_REASONS).toEqual(['hours_spread_between_snapshots']);
  });

  it('rejects an unknown reason and an unlabelled value at the type level', () => {
    // @ts-expect-error — not a domain ApproximateReason
    approximate('roughly', rows);
    // @ts-expect-error — the label is required: a bare value is not Approximated<T>
    const bare: Approximated<typeof rows> = { data: rows };
    const denied: Approximated<typeof rows> = {
      // @ts-expect-error — `approximate` is the literal `true`, never `false`
      approximate: false,
      reasonCode: 'hours_spread_between_snapshots',
      data: rows,
    };
    expect([bare, denied]).toHaveLength(2);
  });
});
