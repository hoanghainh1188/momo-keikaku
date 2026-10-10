/**
 * AD-10 / AR-19: `ComputationInputs` — the fully resolved pin every reported figure reads.
 *
 * Today this is a type alias of `ReviewInput` (story 6.1): evolve the pin fields on
 * `ReviewInput`, keep `computeReview` working, and avoid a big-bang rename of every fixture.
 *
 * **Schedule exception (AR-19):** `domain/schedule` does not read live WP columns from this pin.
 * It reads only `schedule_run.inputs` for the run named by `scheduleRunSeq`. Closure treats
 * `ScheduleInputs` / the stored-inputs codec as reachable via that path.
 */
export type { ReviewInput as ComputationInputs, ReviewInput } from './review';
