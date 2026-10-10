/**
 * For each run, whether inputs and outputs must be retained given the Project's pin set and
 * the latest seq. `pinnedSeqs` is every `schedule_run_seq` a Baseline / Review / export still
 * references, plus any collector-expanded immediate `prev_run_seq` values (Baseline F8) that
 * must keep inputs for re-derive — those seqs are treated as pinned here, so outputs are also
 * retained (conservative; re-derive only needs the inputs).
 */
export function scheduleRunRetention(runs, pinnedSeqs) {
    if (runs.length === 0)
        return [];
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
        const retainInputsFinal = oldestPin === null ? isLatest : retainInputs || run.seq >= oldestPin;
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
export function runsBetweenPins(earlierPin, laterPin, latest) {
    const lo = Math.min(earlierPin, laterPin);
    const hi = Math.max(earlierPin, laterPin, latest);
    const out = [];
    for (let seq = lo; seq <= hi; seq++)
        out.push(seq);
    // Latest below the pin window still retained:
    if (latest < lo)
        out.push(latest);
    return [...new Set(out)].sort((a, b) => a - b);
}
