/**
 * AD-5 / AR-11 schedule_run retention by reference (story 2.9).
 *
 * A run's `inputs` (and its compact `causes` array) may be deleted only when it is older than
 * the oldest run its Project still references and is not the latest. `outputs` may be dropped
 * earlier whenever the run is neither pinned nor latest — they are a pure function of inputs.
 *
 * Pins come from Baselines, Published Snapshots, open Reviews and unexpired exports. Baseline
 * collectors also include each pin's immediate `prev_run_seq` so Story 4.2 re-derive can still
 * load prev inputs (Epic 4 retro F8). Story 2.9 proves the intervening-run rule with two
 * Review-like pins: those runs survive (the set FR-28 walks and a last-N rule would have deleted).
 */
export interface ScheduleRunRetentionRow {
  readonly seq: number;
  readonly hasInputs: boolean;
  readonly hasOutputs: boolean;
}

export interface ScheduleRunRetentionDecision {
  readonly seq: number;
  /** Keep fully resolved inputs (+ causes). */
  readonly retainInputs: boolean;
  /** Keep outputs jsonb; false means droppable / already null. */
  readonly retainOutputs: boolean;
}

/**
 * For each run, whether inputs and outputs must be retained given the Project's pin set and
 * the latest seq. `pinnedSeqs` is every `schedule_run_seq` a Baseline / Review / export still
 * references, plus any collector-expanded immediate `prev_run_seq` values (Baseline F8) that
 * must keep inputs for re-derive — those seqs are treated as pinned here, so outputs are also
 * retained (conservative; re-derive only needs the inputs).
 */
export function scheduleRunRetention(
  runs: readonly ScheduleRunRetentionRow[],
  pinnedSeqs: readonly number[],
): readonly ScheduleRunRetentionDecision[] {
  if (runs.length === 0) return [];
  const latest = Math.max(...runs.map((r) => r.seq));
  const pinned = new Set(pinnedSeqs);
  const oldestPin = pinnedSeqs.length === 0 ? null : Math.min(...pinnedSeqs);

  return runs.map((run) => {
    const isLatest = run.seq === latest;
    const isPinned = pinned.has(run.seq);
    // Inputs: keep when pinned, latest, or not older than the oldest pin (intervening runs).
    const olderThanOldestPin = oldestPin !== null && run.seq < oldestPin;
    const retainInputs = isPinned || isLatest || !olderThanOldestPin;
    // When there is no pin at all, only the latest must keep inputs (all older are droppable).
    const retainInputsFinal =
      oldestPin === null ? isLatest : retainInputs || run.seq >= oldestPin;

    const retainOutputs = isPinned || isLatest;
    return {
      seq: run.seq,
      retainInputs: retainInputsFinal,
      retainOutputs,
    };
  });
}

/**
 * Seqs that must keep inputs when two Reviews pin `earlier` and `later` (inclusive) and the
 * Project's latest is `latest`. Includes every intervening run — the set a last-N rule deletes.
 */
export function runsBetweenPins(
  earlierPin: number,
  laterPin: number,
  latest: number,
): readonly number[] {
  const lo = Math.min(earlierPin, laterPin);
  const hi = Math.max(earlierPin, laterPin, latest);
  const out: number[] = [];
  for (let seq = lo; seq <= hi; seq++) out.push(seq);
  // Latest below the pin window still retained:
  if (latest < lo) out.push(latest);
  return [...new Set(out)].sort((a, b) => a - b);
}
