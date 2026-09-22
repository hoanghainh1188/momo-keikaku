import { describe, expect, it } from 'vitest';
import { fixtureClockOn, systemClock } from './clock';

describe('fixtureClockOn', () => {
  it('returns max(latestObservedAt, anchor)', () => {
    const earlier = '2026-09-16T07:00:00.000Z';
    const later = '2026-09-16T09:00:00.000Z';
    const fromObserved = fixtureClockOn({ latestObservedAt: later, anchor: earlier });
    expect(fromObserved.now().toISOString()).toBe(later);
    expect(fromObserved.nowMs()).toBe(Date.parse(later));

    const fromAnchor = fixtureClockOn({ latestObservedAt: earlier, anchor: later });
    expect(fromAnchor.now().toISOString()).toBe(later);
    expect(fromAnchor.nowMs()).toBe(Date.parse(later));
  });

  it('agrees with itself across now and nowMs', () => {
    const clock = fixtureClockOn({
      latestObservedAt: '2026-09-01T00:00:00.000Z',
      anchor: '2026-09-16T09:00:00.000Z',
    });
    expect(clock.now().getTime()).toBe(clock.nowMs());
  });
});

describe('systemClock', () => {
  it('still exposes now and nowMs that agree', () => {
    const a = systemClock.nowMs();
    const b = systemClock.now().getTime();
    expect(Math.abs(a - b)).toBeLessThan(50);
  });
});
