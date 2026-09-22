// The ONLY place in application code allowed to read the wall clock. `Date.now()`, bare
// `new Date()` and `Date()` called without `new` are ESLint errors everywhere else (see
// eslint.config.js), because the scheduler's determinism depends on time arriving as an
// injected value rather than being reachable from any call site.
//
// Note `new Date(someIso)` is NOT banned — parsing a stored instant reads no clock. Only
// the zero-argument form does. `Date(...)` without `new` always does, whatever arguments
// it is handed, so it is banned outright.
//
// This exemption covers the clock only. Reading the environment from here is still a lint
// error; that is packages/app/src/config.ts's job, not this file's.

/** Wall time, as a port. Inject it; never reach for the clock directly. */
export interface Clock {
  /** The current instant. */
  now(): Date;
  /** The current instant in epoch milliseconds. */
  nowMs(): number;
}

/**
 * The real clock. Composition roots wire this in; tests and the fixture-mode clock
 * (story 1.8) substitute their own `Clock`.
 */
export const systemClock: Clock = {
  now: () => new Date(),
  nowMs: () => Date.now(),
};

function asMs(value: Date | string | number): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return new Date(value).getTime();
  return value.getTime();
}

/**
 * Fixture-mode clock (AD-15 / AR-27): `now()` is
 * `max(latest fixture observedAt, FIXTURE_TIME_ANCHOR)`. Both roles and the seed share it
 * under `CLOCK_MODE=fixture` so freshness and the current Reporting Period agree with the
 * fixture timeline. Identity / Better Auth stay on `systemClock`.
 */
export function fixtureClockOn(args: {
  readonly latestObservedAt: Date | string | number;
  readonly anchor: Date | string | number;
}): Clock {
  const ms = Math.max(asMs(args.latestObservedAt), asMs(args.anchor));
  return {
    now: () => new Date(ms),
    nowMs: () => ms,
  };
}

/**
 * Demo last-snapshot offset before `FIXTURE_TIME_ANCHOR`. Composition roots pass
 * `anchorMs + DEMO_LATEST_OBSERVED_OFFSET_MS` into `fixtureClockOn` so they need not
 * import `packages/db/src/fixtures.ts` (filesystem) into the Next bundle. Must stay
 * equal to `latestFixtureObservedAt(anchor) − anchor` for the shipped demo
 * (`packages/db/src/fixtures-time.test.ts`). Seed still reads the real latest via
 * `latestFixtureObservedAt`.
 */
export const DEMO_LATEST_OBSERVED_OFFSET_MS = -2 * 3_600_000;

/**
 * Product Clock for composition roots (web + worker). Reads no environment — callers
 * pass already-parsed `CLOCK_MODE` / `FIXTURE_TIME_ANCHOR`. Seed uses a different path
 * (`latestFixtureObservedAt`) and does not call this.
 */
export function productClockOn(args: {
  readonly mode: 'system' | 'fixture';
  /** Required when `mode` is `fixture`. Absolute ISO instant. */
  readonly fixtureTimeAnchor?: string;
}): Clock {
  switch (args.mode) {
    case 'system':
      return systemClock;
    case 'fixture': {
      const anchor = args.fixtureTimeAnchor;
      if (anchor === undefined || anchor === '') {
        throw new Error('productClockOn: fixtureTimeAnchor is required when mode is fixture');
      }
      const anchorMs = Date.parse(anchor);
      if (Number.isNaN(anchorMs)) {
        throw new Error(`productClockOn: invalid fixtureTimeAnchor "${anchor}"`);
      }
      return fixtureClockOn({
        latestObservedAt: anchorMs + DEMO_LATEST_OBSERVED_OFFSET_MS,
        anchor: anchorMs,
      });
    }
  }
}
