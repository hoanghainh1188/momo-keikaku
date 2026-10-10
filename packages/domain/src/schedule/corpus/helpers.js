/** A leaf (or summary) row for a hand-pinned expected `ScheduleOutputs`. */
export function out(wpId, fields) {
    return {
        wpId,
        state: fields.state,
        earlyStart: fields.earlyStart,
        earlyFinish: fields.earlyFinish,
        remainingDays: fields.remainingDays,
        notSchedulableReason: fields.notSchedulableReason ?? null,
        plannedMh: fields.plannedMh ?? 0n,
        lateStart: fields.lateStart ?? null,
        lateFinish: fields.lateFinish ?? null,
        floatDays: fields.floatDays ?? null,
        isCritical: fields.isCritical ?? false,
        drivingPredecessors: fields.drivingPredecessors ?? [],
        // Corpus cases run with `prevInputs` null — every cause is null (story 2.9).
        cause: null,
    };
}
