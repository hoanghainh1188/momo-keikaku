/**
 * Second enumerated surface for Epic 1's role and audit gates (Epic 2 retro F10 / Q1→B).
 *
 * Schedule fence and calendar publish writers live on `@momo/app`'s package barrel but stay
 * outside `use-cases/index.ts`. The gates enumerate THIS module list mechanically — the same
 * spirit as `readSurfaceFunctionNames()` — so a new write export without a `*_ROLES` /
 * `*_AUDIT` merge fails CI, named. Thin `plan-edit` / `apply-predecessor-set` wrappers are
 * deliberately not listed: they call `applyPlanChange` and inherit its declarations.
 */
import type { RequestContext } from '../packages/app/src/authz/request-context';
import type { Result } from '../packages/app/src/result';
import * as calendarWrites from '../packages/app/src/calendar/publish-calendar-version';
import * as scheduleFence from '../packages/app/src/schedule/apply-plan-change';

/** Named in failure messages — the modules whose function exports the gates enumerate. */
export const SCHEDULE_CALENDAR_WRITE_MODULES = [
  'packages/app/src/schedule/apply-plan-change.ts',
  'packages/app/src/calendar/publish-calendar-version.ts',
] as const;

type WriteFn = (
  deps: unknown,
  ctx: RequestContext,
  input: unknown,
) => Promise<Result<unknown>>;

const MODULE_NAMESPACES: ReadonlyArray<Readonly<Record<string, unknown>>> = [
  scheduleFence,
  calendarWrites,
];

/** Every exported function of the schedule/calendar write modules, sorted. */
export function readScheduleCalendarWriteFunctionNames(): string[] {
  return MODULE_NAMESPACES.flatMap((ns) =>
    Object.entries(ns)
      .filter(([, value]) => typeof value === 'function')
      .map(([name]) => name),
  ).sort();
}

/** Callable map for the role gate's behavioural half. */
export function scheduleCalendarWriteFns(): Readonly<Record<string, WriteFn>> {
  const out: Record<string, WriteFn> = {};
  for (const ns of MODULE_NAMESPACES) {
    for (const [name, value] of Object.entries(ns)) {
      if (typeof value === 'function') out[name] = value as WriteFn;
    }
  }
  return out;
}
