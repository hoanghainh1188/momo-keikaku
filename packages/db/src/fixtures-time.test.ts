import { describe, expect, it } from 'vitest';
import { latestFixtureObservedAt, loadFixtureProject, loadFixtureSnapshots } from './fixtures';

/** Same offset web/worker composition roots hard-code for the shipped demo (story 1.8). */
const DEMO_LATEST_OBSERVED_OFFSET_MS = -2 * 3_600_000;

describe('latestFixtureObservedAt', () => {
  it('is exactly anchor−2h for the shipped demo (pins composition DEMO_LATEST_OBSERVED_OFFSET_MS)', () => {
    const fixture = loadFixtureProject();
    const snaps = loadFixtureSnapshots(fixture.anchor);
    const latest = latestFixtureObservedAt(fixture.anchor);
    const max = Math.max(...snaps.map((s) => Date.parse(s.observedAt)));
    expect(latest.getTime()).toBe(max);
    // Composition roots pass `anchorMs + DEMO_LATEST_OBSERVED_OFFSET_MS` into fixtureClockOn —
    // seed uses this helper. Both must stay at exactly −2h for the shipped demo pages.
    const anchorMs = Date.parse(fixture.anchor);
    expect(latest.getTime()).toBe(anchorMs + DEMO_LATEST_OBSERVED_OFFSET_MS);
  });
});
