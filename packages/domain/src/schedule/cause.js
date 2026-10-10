/** FR-28's closed seven-cause list. */
export const WP_MOVE_CAUSES = [
    'edited',
    'moved by a predecessor',
    'calendar changed',
    'data date advanced',
    'actual dates recorded',
    'progress changed',
    'project dates changed',
];
/** True when the WP's early start or early finish changed between two output rows. */
export function datesMoved(prev, next) {
    if (prev === undefined)
        return next.earlyStart !== null || next.earlyFinish !== null;
    return prev.earlyStart !== next.earlyStart || prev.earlyFinish !== next.earlyFinish;
}
function sameRatio(a, b) {
    if (a === null && b === null)
        return true;
    if (a === null || b === null)
        return false;
    return a.num === b.num && a.den === b.den;
}
function sameCalendar(a, b) {
    if (a.rangeStart !== b.rangeStart || a.rangeEnd !== b.rangeEnd)
        return false;
    if (a.nonWorkingDays.length !== b.nonWorkingDays.length)
        return false;
    const left = [...a.nonWorkingDays].sort();
    const right = [...b.nonWorkingDays].sort();
    return left.every((d, i) => d === right[i]);
}
function wpById(inputs) {
    return new Map(inputs.wps.map((wp) => [wp.id, wp]));
}
function leafInputsChanged(prev, next) {
    if (prev === undefined)
        return true;
    return (prev.durationDays !== next.durationDays ||
        prev.constraintType !== next.constraintType ||
        prev.constraintDate !== next.constraintDate);
}
function actualsChanged(prev, next) {
    if (prev === undefined) {
        return next.actualStart !== null || next.actualFinish !== null;
    }
    return prev.actualStart !== next.actualStart || prev.actualFinish !== next.actualFinish;
}
function progressChanged(prev, next) {
    if (prev === undefined)
        return next.recordedPct !== null;
    return !sameRatio(prev.recordedPct, next.recordedPct);
}
/**
 * The per-WP cause for one scheduled run, parallel to `outputs.wps`. Null when there is no
 * previous run, or when that WP's early dates did not move.
 */
export function deriveWpCauses(inputs, prevInputs, outputs, prevOutputs) {
    if (prevInputs === null || prevOutputs === null) {
        return outputs.wps.map(() => null);
    }
    const prevWp = wpById(prevInputs);
    const prevOut = new Map(prevOutputs.wps.map((row) => [row.wpId, row]));
    const calendarChanged = !sameCalendar(prevInputs.calendar, inputs.calendar);
    const dataDateChanged = prevInputs.dataDate !== inputs.dataDate;
    const projectDatesChanged = prevInputs.projectStart !== inputs.projectStart ||
        prevInputs.projectFinish !== inputs.projectFinish;
    return outputs.wps.map((row) => {
        if (!datesMoved(prevOut.get(row.wpId), row))
            return null;
        const next = inputs.wps.find((wp) => wp.id === row.wpId);
        if (next === undefined)
            return 'edited';
        const prev = prevWp.get(row.wpId);
        if (leafInputsChanged(prev, next))
            return 'edited';
        if (actualsChanged(prev, next))
            return 'actual dates recorded';
        if (progressChanged(prev, next))
            return 'progress changed';
        if (calendarChanged)
            return 'calendar changed';
        if (dataDateChanged)
            return 'data date advanced';
        if (projectDatesChanged)
            return 'project dates changed';
        return 'moved by a predecessor';
    });
}
/** Overlay per-WP causes onto scheduled outputs (same WP order). */
export function withCauses(outputs, causes) {
    if (causes.length !== outputs.wps.length) {
        throw new RangeError(`withCauses: causes length ${causes.length} ≠ outputs.wps length ${outputs.wps.length}`);
    }
    return {
        ...outputs,
        wps: outputs.wps.map((row, i) => ({ ...row, cause: causes[i] })),
    };
}
/** Compact causes array retained with inputs when outputs are dropped (AD-26 / AR-11). */
export function causesArray(outputs) {
    return outputs.wps.map((row) => row.cause);
}
