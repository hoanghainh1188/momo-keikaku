/**
 * Story 5.7 / AD-8: measurement-basis latch with hysteresis N = 3 both ways.
 *
 * Pure streak helper — mirrors `advanceLeftScopeState`. Incomplete snapshots never call this.
 * The writer appends `measurement_basis_event` only when `flipped` is true.
 */
/**
 * Advance the latched basis by one complete snapshot's observed basis.
 *
 * → `hours` after 3 consecutive complete observations of hours;
 * → `count` after 3 consecutive complete observations of count;
 * automatic both directions, no confirmation (founder A3).
 */
export function advanceBasisLatch(current, observed) {
    if (observed === current.basis) {
        return { basis: current.basis, streakTowardOpposite: 0, flipped: false };
    }
    const streak = current.streakTowardOpposite + 1;
    if (streak >= 3) {
        return { basis: observed, streakTowardOpposite: 0, flipped: true };
    }
    return { basis: current.basis, streakTowardOpposite: streak, flipped: false };
}
/**
 * Replay complete observations (oldest → newest) from a known latch head.
 * Used by ingest after a successful complete write to decide whether to append an event.
 */
export function replayBasisLatch(initial, observedSequence) {
    let state = initial;
    let flipped = false;
    for (const observed of observedSequence) {
        const next = advanceBasisLatch(state, observed);
        if (next.flipped)
            flipped = true;
        state = next;
    }
    return { ...state, flipped: flipped || state.basis !== initial.basis };
}
/** Missing `measurement_basis_event` head treats as Ticket-Count Mode until hours hysteresis fires. */
export const INITIAL_BASIS_LATCH = {
    basis: 'count',
    streakTowardOpposite: 0,
};
