/**
 * WALL TIME, AS A PORT (AD-15, story 1.3 slice 2).
 *
 * The architecture says wall time comes only from a `Clock`, and ESLint bans `Date.now()` and a
 * bare `new Date()` everywhere but the clock adapter. The organisation writes are the first use
 * cases that need the time of day rather than a Project's `demoAnchor`: an org change has no
 * Project anchor to borrow (a new Department has no Project at all), and its audit `at` is when
 * it happened.
 *
 * DECLARED HERE, SATISFIED STRUCTURALLY — exactly like the repository ports. `packages/adapters`
 * owns the implementation (`systemClock`); `packages/app` may not import it, and does not need
 * to: the composition root hands `systemClock` over and TypeScript checks the match at its
 * `satisfies`. A test hands a fixed clock instead.
 *
 * Only `now` is declared, because only `now` is used. `systemClock` carries `nowMs` as well; a
 * wider object satisfies a narrower port.
 */
export interface Clock {
  /** The current instant. */
  readonly now: () => Date;
}
