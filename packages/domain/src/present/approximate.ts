/**
 * `@momo/domain/present/approximate` — the web's one entry to the approximate envelope
 * (story 5.14). Types only: nothing that computes crosses with them.
 *
 * Kept out of `present/index.ts` on purpose, so that importing the presentation barrel never
 * reaches the person/day-level contract; `.dependency-cruiser.cjs` allows this file alongside
 * the barrel (`web-to-domain-present-only`) and bars both from the Client View
 * (`client-view-not-to-approximate`).
 */
export type { ApproximateReason, Approximated } from '../approximate';
