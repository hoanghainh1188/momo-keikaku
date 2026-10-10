import * as compareBaselineVersionsRead from '../packages/app/src/baseline/compare-baseline-versions';
import * as reBaselineWrite from '../packages/app/src/baseline/re-baseline';
import * as reDerivePinnedBaselineRead from '../packages/app/src/baseline/re-derive-pinned';
import * as setBaselineWrite from '../packages/app/src/baseline/set-baseline';
import * as calendarWrites from '../packages/app/src/calendar/publish-calendar-version';
import * as scheduleFence from '../packages/app/src/schedule/apply-plan-change';
/** One source for both failure-message paths and the namespaces the gates enumerate. */
const SCHEDULE_CALENDAR_WRITE_SURFACE = [
    { path: 'packages/app/src/schedule/apply-plan-change.ts', ns: scheduleFence },
    { path: 'packages/app/src/calendar/publish-calendar-version.ts', ns: calendarWrites },
    { path: 'packages/app/src/baseline/set-baseline.ts', ns: setBaselineWrite },
    { path: 'packages/app/src/baseline/re-baseline.ts', ns: reBaselineWrite },
    {
        path: 'packages/app/src/baseline/compare-baseline-versions.ts',
        ns: compareBaselineVersionsRead,
    },
    {
        path: 'packages/app/src/baseline/re-derive-pinned.ts',
        ns: reDerivePinnedBaselineRead,
    },
];
/** Named in failure messages — derived from SCHEDULE_CALENDAR_WRITE_SURFACE. */
export const SCHEDULE_CALENDAR_WRITE_MODULES = SCHEDULE_CALENDAR_WRITE_SURFACE.map((entry) => entry.path);
/** True for a non-null object (or array) with a function anywhere among its own values. */
function holdsFunctions(value) {
    if (value === null || typeof value !== 'object')
        return false;
    return Object.values(value).some((member) => typeof member === 'function');
}
function isSurfaceExport(value) {
    return typeof value === 'function' || holdsFunctions(value);
}
/** Every exported function (or function-holding namespace) of the write modules, sorted. */
export function readScheduleCalendarWriteFunctionNames() {
    return SCHEDULE_CALENDAR_WRITE_SURFACE.flatMap(({ ns }) => Object.entries(ns)
        .filter(([, value]) => isSurfaceExport(value))
        .map(([name]) => name)).sort();
}
/** Callable map for the role gate's behavioural half. */
export function scheduleCalendarWriteFns() {
    const out = {};
    for (const { ns } of SCHEDULE_CALENDAR_WRITE_SURFACE) {
        for (const [name, value] of Object.entries(ns)) {
            if (isSurfaceExport(value))
                out[name] = value;
        }
    }
    return out;
}
