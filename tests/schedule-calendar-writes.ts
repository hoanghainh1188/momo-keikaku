/**
 * Second enumerated surface for Epic 1's role and audit gates (Epic 2 retro F10 / Q1→B).
 *
 * Schedule fence, calendar publish, and Baseline writers live on `@momo/app`'s package barrel
 * but stay outside `use-cases/index.ts`. The gates enumerate THIS module list mechanically —
 * the same spirit as `readSurfaceFunctionNames()` — so a new write export without a `*_ROLES` /
 * `*_AUDIT` merge fails CI, named. Thin `plan-edit` / `apply-predecessor-set` wrappers are
 * deliberately not listed: they call `applyPlanChange` and inherit its declarations.
 */
import type { RequestContext } from '../packages/app/src/authz/request-context';
import type { Result } from '../packages/app/src/result';
import * as compareBaselineVersionsRead from '../packages/app/src/baseline/compare-baseline-versions';
import * as reBaselineWrite from '../packages/app/src/baseline/re-baseline';
import * as setBaselineWrite from '../packages/app/src/baseline/set-baseline';
import * as calendarWrites from '../packages/app/src/calendar/publish-calendar-version';
import * as scheduleFence from '../packages/app/src/schedule/apply-plan-change';

type WriteFn = (
  deps: unknown,
  ctx: RequestContext,
  input: unknown,
) => Promise<Result<unknown>>;

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
] as const;

/** Named in failure messages — derived from SCHEDULE_CALENDAR_WRITE_SURFACE. */
export const SCHEDULE_CALENDAR_WRITE_MODULES = SCHEDULE_CALENDAR_WRITE_SURFACE.map(
  (entry) => entry.path,
);

/** True for a non-null object (or array) with a function anywhere among its own values. */
function holdsFunctions(value: unknown): boolean {
  if (value === null || typeof value !== 'object') return false;
  return Object.values(value).some((member) => typeof member === 'function');
}

function isSurfaceExport(value: unknown): boolean {
  return typeof value === 'function' || holdsFunctions(value);
}

/** Every exported function (or function-holding namespace) of the write modules, sorted. */
export function readScheduleCalendarWriteFunctionNames(): string[] {
  return SCHEDULE_CALENDAR_WRITE_SURFACE.flatMap(({ ns }) =>
    Object.entries(ns)
      .filter(([, value]) => isSurfaceExport(value))
      .map(([name]) => name),
  ).sort();
}

/** Callable map for the role gate's behavioural half. */
export function scheduleCalendarWriteFns(): Readonly<Record<string, WriteFn>> {
  const out: Record<string, WriteFn> = {};
  for (const { ns } of SCHEDULE_CALENDAR_WRITE_SURFACE) {
    for (const [name, value] of Object.entries(ns)) {
      if (isSurfaceExport(value)) out[name] = value as WriteFn;
    }
  }
  return out;
}
