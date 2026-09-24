/**
 * Per-WP FR-28 cause derivation (story 2.9, AD-26).
 *
 * `schedule_run.cause` (the column) is the **trigger kind** — what fired the run. The seven
 * What-moved causes live per WP, derived from `diff(prevInputs, inputs)` plus whether that WP's
 * early dates moved. *Moved by a predecessor* is never a run-level trigger.
 *
 * First run (`prevInputs` null): every cause is null. A WP whose early dates did not move also
 * carries null, even when a neighbour's inputs changed.
 */
import type { CalendarVersion, IsoDate } from '../calendar';
import type { Ratio } from '../units';
import type {
  ScheduleInputs,
  ScheduleOutputs,
  ScheduleWp,
  WpScheduleOutput,
} from './recalculate';

/** FR-28's closed seven-cause list. */
export const WP_MOVE_CAUSES = [
  'edited',
  'moved by a predecessor',
  'calendar changed',
  'data date advanced',
  'actual dates recorded',
  'progress changed',
  'project dates changed',
] as const;

export type WpMoveCause = (typeof WP_MOVE_CAUSES)[number];

/** True when the WP's early start or early finish changed between two output rows. */
export function datesMoved(prev: WpScheduleOutput | undefined, next: WpScheduleOutput): boolean {
  if (prev === undefined) return next.earlyStart !== null || next.earlyFinish !== null;
  return prev.earlyStart !== next.earlyStart || prev.earlyFinish !== next.earlyFinish;
}

function sameRatio(a: Ratio | null, b: Ratio | null): boolean {
  if (a === null && b === null) return true;
  if (a === null || b === null) return false;
  return a.num === b.num && a.den === b.den;
}

function sameCalendar(a: CalendarVersion, b: CalendarVersion): boolean {
  if (a.rangeStart !== b.rangeStart || a.rangeEnd !== b.rangeEnd) return false;
  if (a.nonWorkingDays.length !== b.nonWorkingDays.length) return false;
  const left = [...a.nonWorkingDays].sort();
  const right = [...b.nonWorkingDays].sort();
  return left.every((d, i) => d === right[i]);
}

function wpById(inputs: ScheduleInputs): Map<string, ScheduleWp> {
  return new Map(inputs.wps.map((wp) => [wp.id, wp]));
}

function leafInputsChanged(prev: ScheduleWp | undefined, next: ScheduleWp): boolean {
  if (prev === undefined) return true;
  return (
    prev.durationDays !== next.durationDays ||
    prev.constraintType !== next.constraintType ||
    prev.constraintDate !== next.constraintDate
  );
}

function actualsChanged(prev: ScheduleWp | undefined, next: ScheduleWp): boolean {
  if (prev === undefined) {
    return next.actualStart !== null || next.actualFinish !== null;
  }
  return prev.actualStart !== next.actualStart || prev.actualFinish !== next.actualFinish;
}

function progressChanged(prev: ScheduleWp | undefined, next: ScheduleWp): boolean {
  if (prev === undefined) return next.recordedPct !== null;
  return !sameRatio(prev.recordedPct, next.recordedPct);
}

/**
 * The per-WP cause for one scheduled run, parallel to `outputs.wps`. Null when there is no
 * previous run, or when that WP's early dates did not move.
 */
export function deriveWpCauses(
  inputs: ScheduleInputs,
  prevInputs: ScheduleInputs | null,
  outputs: ScheduleOutputs,
  prevOutputs: ScheduleOutputs | null,
): readonly (WpMoveCause | null)[] {
  if (prevInputs === null || prevOutputs === null) {
    return outputs.wps.map(() => null);
  }

  const prevWp = wpById(prevInputs);
  const prevOut = new Map(prevOutputs.wps.map((row) => [row.wpId, row]));
  const calendarChanged = !sameCalendar(prevInputs.calendar, inputs.calendar);
  const dataDateChanged = prevInputs.dataDate !== inputs.dataDate;
  const projectDatesChanged =
    prevInputs.projectStart !== inputs.projectStart ||
    prevInputs.projectFinish !== inputs.projectFinish;

  return outputs.wps.map((row) => {
    if (!datesMoved(prevOut.get(row.wpId), row)) return null;

    const next = inputs.wps.find((wp) => wp.id === row.wpId);
    if (next === undefined) return 'edited';
    const prev = prevWp.get(row.wpId);

    if (leafInputsChanged(prev, next)) return 'edited';
    if (actualsChanged(prev, next)) return 'actual dates recorded';
    if (progressChanged(prev, next)) return 'progress changed';
    if (calendarChanged) return 'calendar changed';
    if (dataDateChanged) return 'data date advanced';
    if (projectDatesChanged) return 'project dates changed';
    return 'moved by a predecessor';
  });
}

/** Overlay per-WP causes onto scheduled outputs (same WP order). */
export function withCauses(
  outputs: ScheduleOutputs,
  causes: readonly (WpMoveCause | null)[],
): ScheduleOutputs {
  if (causes.length !== outputs.wps.length) {
    throw new RangeError(
      `withCauses: causes length ${causes.length} ≠ outputs.wps length ${outputs.wps.length}`,
    );
  }
  return {
    ...outputs,
    wps: outputs.wps.map((row, i) => ({ ...row, cause: causes[i]! })),
  };
}

/** Compact causes array retained with inputs when outputs are dropped (AD-26 / AR-11). */
export function causesArray(outputs: ScheduleOutputs): readonly (WpMoveCause | null)[] {
  return outputs.wps.map((row) => row.cause);
}

/** Run-level trigger kinds written to `schedule_run.cause` (not FR-28). */
export type ScheduleRunCause =
  | 'duration'
  | 'constraint'
  | 'dependency_added'
  | 'dependency_removed'
  | 'dependency_re_lagged'
  | 'calendar'
  | 'data_date'
  | 'project_dates'
  | 'wp_created'
  | 'wp_deleted'
  | 'wp_moved'
  | 'actual_dates'
  | 'progress'
  | 'plan_edit'
  | 'seed';

export type IsoDateOrNull = IsoDate | null;
