/**
 * Story 5.14 / FR-26 / ARCHITECTURE-SPINE "Approximation label": every person- or day-level
 * actuals output is approximate, because hours are spread between Tracker Snapshots, not taken
 * from worklogs. The label lives on the domain output, in this envelope.
 *
 * Its own module, deliberately re-exported by NEITHER barrel — not `index.ts`, not
 * `present/index.ts`. The Client View reaches the `@momo/domain` barrel through `packages/app`,
 * and depcruise rule `client-view-not-to-approximate` (`reachable: true`) would fire on every
 * real Client View if the barrel reached this file. Domain producers import `./approximate`
 * directly; the web reaches the types only through `present/approximate.ts`
 * (`@momo/domain/present/approximate`). Guarded by `apps/web/src/app/approximate-guards.test.ts`.
 */
/**
 * The closed set of domain reasons a figure is approximate. A code, never prose — the UI maps it
 * to an i18n caption (`actuals.approximate.<reason>`).
 */
export const APPROXIMATE_REASONS = ['hours_spread_between_snapshots'];
/**
 * Label `data` as approximate for `reasonCode`. The freeze is SHALLOW: the envelope's own fields
 * (`approximate`, `reasonCode`, `data`) cannot be reassigned, but `data` itself is not frozen.
 */
export const approximate = (reasonCode, data) => Object.freeze({ approximate: true, reasonCode, data });
