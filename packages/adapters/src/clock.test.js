import { describe, expect, it } from 'vitest';
import { DEMO_LATEST_OBSERVED_OFFSET_MS, fixtureClockOn, productClockOn, systemClock, } from './clock';
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
describe('productClockOn', () => {
    it('returns systemClock in system mode', () => {
        expect(productClockOn({ mode: 'system' })).toBe(systemClock);
    });
    it('uses DEMO_LATEST_OBSERVED_OFFSET_MS under fixture mode', () => {
        const anchor = '2026-09-16T09:00:00.000Z';
        const anchorMs = Date.parse(anchor);
        const clock = productClockOn({ mode: 'fixture', fixtureTimeAnchor: anchor });
        expect(clock.nowMs()).toBe(Math.max(anchorMs + DEMO_LATEST_OBSERVED_OFFSET_MS, anchorMs));
    });
    it('refuses fixture mode without an anchor', () => {
        expect(() => productClockOn({ mode: 'fixture' })).toThrow(/fixtureTimeAnchor/);
    });
    it('refuses a non-parseable fixtureTimeAnchor', () => {
        expect(() => productClockOn({ mode: 'fixture', fixtureTimeAnchor: 'not-an-instant' })).toThrow(/invalid fixtureTimeAnchor/);
    });
});
describe('systemClock', () => {
    it('still exposes now and nowMs that agree', () => {
        const a = systemClock.nowMs();
        const b = systemClock.now().getTime();
        expect(Math.abs(a - b)).toBeLessThan(50);
    });
});
