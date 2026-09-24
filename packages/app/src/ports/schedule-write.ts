/**
 * The scheduling write surface's bound handle (story 2.9).
 *
 * `app/schedule` builds `plan-input` / `schedule` repositories from this pair. The concrete
 * `tx` type lives in `packages/db`; here it is opaque so `@momo/app` does not depend on Drizzle.
 * `packages/db`'s `Bound` satisfies this structurally.
 */
export interface SchedulingBound {
  /** The open tenant transaction — never opened by the repositories themselves. */
  readonly tx: unknown;
  readonly tenantId: string;
}

export interface SchedulingScope {
  readonly bound: SchedulingBound;
}
