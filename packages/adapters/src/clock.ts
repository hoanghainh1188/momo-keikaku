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
