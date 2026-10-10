import { addDays, isWeekend, } from '@momo/domain';
/**
 * The scheduler's test fixture builders (stories 2.5–2.7), shared by every
 * `recalculate*.test.ts` so the forward, backward and constraint suites build plans the same way.
 *
 * October 2026: Mon 5 … Fri 9, Sat 10, Sun 11, Mon 12 … Fri 16, Mon 19 …
 */
export const PROJECT = 'prj-a';
/** A hand-built version: every weekend in range, plus `holidays`. */
export function calendar(rangeStart, rangeEnd, holidays = []) {
    const nonWorkingDays = [...holidays];
    for (let d = rangeStart; d <= rangeEnd; d = addDays(d, 1))
        if (isWeekend(d))
            nonWorkingDays.push(d);
    return { nonWorkingDays, rangeStart, rangeEnd };
}
export const CAL = calendar('2026-09-01', '2027-12-31');
/**
 * Synthetic JP / VN calendars for the golden corpus (story 2.8, Q3 → A).
 * Weekends are listed explicitly; each adds one mid-week holiday the other lacks.
 * Not national datasets — those arrive in 2.12.
 */
export const CAL_JP = calendar('2026-09-01', '2027-12-31', ['2026-10-07']); // Wed
export const CAL_VN = calendar('2026-09-01', '2027-12-31', ['2026-10-13']); // Tue
/** A WP whose id doubles as its WBS code, so `compareWp` order is the natural order of the ids. */
export const wp = (id, spec = {}) => ({
    id,
    wbsCode: id,
    projectId: spec.projectId ?? PROJECT,
    parentId: spec.parentId ?? null,
    durationDays: spec.durationDays === undefined ? 1 : spec.durationDays,
    plannedMh: spec.plannedMh ?? 0n,
    actualStart: spec.actualStart ?? null,
    actualFinish: spec.actualFinish ?? null,
    recordedPct: spec.recordedPct ?? null,
    constraintType: spec.constraintType ?? 'asap',
    constraintDate: spec.constraintDate ?? null,
});
export const edge = (predecessorId, successorId, lagDays = 0) => ({
    predecessorId,
    successorId,
    lagDays,
});
/** Data Date Mon 5 Oct 2026, Project start 1 Sep 2026, no Project finish, `CAL`. */
export function inputs(wps, edges = [], over = {}) {
    return {
        projectId: PROJECT,
        wps,
        edges,
        projectStart: '2026-09-01',
        dataDate: '2026-10-05',
        projectFinish: null,
        calendar: CAL,
        ...over,
    };
}
export function scheduled(result) {
    if (result.kind !== 'scheduled')
        throw new Error(`expected a schedule, got ${result.reason}`);
    return result.outputs;
}
export function row(outputs, id) {
    const found = outputs.wps.find((w) => w.wpId === id);
    if (found === undefined)
        throw new Error(`no output row for ${id}`);
    return found;
}
