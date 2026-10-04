/**
 * Story 4.5 — Baseline Divergence vs the pinned `schedule_run` (AR-22) and Plan-column Δ
 * helpers (active `baseline_wp` vs Current Plan).
 *
 * Two comparisons stay separate on purpose:
 * - Divergence: `baseline_wp` ↔ pinned run (`outputs` dates, `inputs` effort/duration).
 *   Never `wp_schedule` or live `work_package` columns (AD-10 / AR-22).
 * - Plan columns: `baseline_wp` ↔ Current Plan derived figures already on the Plan grid.
 */

import type { CalendarVersion, IsoDate } from '../calendar';
import { addDays, floorPosition, workingDayIndex } from '../calendar';
import type { StoredScheduleInputs, StoredScheduleOutputs } from './stored-run';

/** Leaf cost-projection slice from `baseline_wp` (no duration column on the table). */
export interface BaselineWpCostProjection {
  readonly wpId: string;
  readonly start: IsoDate;
  readonly finish: IsoDate;
  readonly baselineMh: bigint;
}

/** Per-WP Divergence against the pinned run (AR-22 sources only). */
export interface DivergenceFromPinned {
  readonly wpId: string;
  /** Pin `outputs.earlyStart` − `baseline_wp.start` (working days when calendar available). */
  readonly startDeltaDays: number | null;
  /** Pin `outputs.earlyFinish` − `baseline_wp.finish`. */
  readonly finishDeltaDays: number | null;
  /**
   * Pin `inputs.durationDays` − working-day span of `baseline_wp` start/finish when that span
   * is computable; otherwise null. Baseline duration is not stored on `baseline_wp`.
   */
  readonly durationDeltaDays: number | null;
  /** Pin `inputs.plannedMh` − `baseline_wp.baselineMh`. */
  readonly effortDeltaMh: bigint | null;
  readonly pinEarlyStart: IsoDate | null;
  readonly pinEarlyFinish: IsoDate | null;
  readonly pinDurationDays: number | null;
  readonly pinPlannedMh: bigint | null;
}

/** Plan-grid Baseline compare fields (active Baseline vs Current Plan). */
export interface PlanBaselineCompare {
  readonly wpId: string;
  readonly baselineStart: IsoDate | null;
  readonly baselineFinish: IsoDate | null;
  readonly baselineDurationDays: number | null;
  readonly baselineMh: bigint | null;
  readonly derivedStart: IsoDate | null;
  readonly derivedFinish: IsoDate | null;
  readonly durationDays: number | null;
  readonly plannedMh: bigint | null;
  /** Current − Baseline (signed). Null when either side is N/A. */
  readonly startDeltaDays: number | null;
  readonly finishDeltaDays: number | null;
  readonly durationDeltaDays: number | null;
  readonly effortDeltaMh: bigint | null;
}

/**
 * Inclusive calendar-day difference `to − from` (can be negative). Null when either date missing.
 * Used when no Project calendar is in hand (Implementation Notes fallback).
 */
export function calendarDayDelta(from: IsoDate | null, to: IsoDate | null): number | null {
  if (from === null || to === null) return null;
  if (from === to) return 0;
  let n = 0;
  if (to > from) {
    for (let d = from; d < to; d = addDays(d, 1)) n += 1;
    return n;
  }
  for (let d = to; d < from; d = addDays(d, 1)) n += 1;
  return -n;
}

/**
 * Signed working-day date Δ (`to − from`) when both dates are in the calendar range;
 * otherwise calendar-day integer Δ. Null when either date is missing.
 */
export function signedDateDeltaDays(
  from: IsoDate | null,
  to: IsoDate | null,
  calendar: CalendarVersion | null,
): number | null {
  if (from === null || to === null) return null;
  if (from === to) return 0;
  if (calendar === null) return calendarDayDelta(from, to);
  try {
    const idx = workingDayIndex(calendar);
    const a = floorPosition(idx, from);
    const b = floorPosition(idx, to);
    if (!a.ok || !b.ok) return calendarDayDelta(from, to);
    return b.value - a.value;
  } catch {
    return calendarDayDelta(from, to);
  }
}

/** Signed integer Δ; null when either side is null (N/A). */
export function signedIntDelta(
  baseline: number | null,
  current: number | null,
): number | null {
  if (baseline === null || current === null) return null;
  return current - baseline;
}

/** Signed milli-hour Δ; null when either side is null. */
export function signedMhDelta(
  baseline: bigint | null,
  current: bigint | null,
): bigint | null {
  if (baseline === null || current === null) return null;
  return current - baseline;
}

/**
 * Working-day count of a dated span on a calendar (same position arithmetic as date Δ),
 * or calendar-day span + 1 when no calendar. Null when either date missing.
 */
export function durationDaysFromDates(
  start: IsoDate | null,
  finish: IsoDate | null,
  calendar: CalendarVersion | null,
): number | null {
  if (start === null || finish === null) return null;
  if (finish < start) return null;
  const delta = signedDateDeltaDays(start, finish, calendar);
  if (delta === null) return null;
  return delta + 1;
}

/**
 * AR-22 Divergence: compare each `baseline_wp` row to the **pinned** run only.
 * Dates from `outputs.earlyStart|earlyFinish`; effort/duration from `inputs` matched by `wp_id`.
 */
export function divergenceFromPinned(input: {
  readonly baselineWps: readonly BaselineWpCostProjection[];
  readonly pinnedInputs: StoredScheduleInputs;
  readonly pinnedOutputs: StoredScheduleOutputs;
  /** Optional calendar for working-day date Δ (defaults to the pin's stored calendar). */
  readonly calendar?: CalendarVersion | null;
}): readonly DivergenceFromPinned[] {
  const calendar = input.calendar ?? input.pinnedInputs.calendar;
  const pinByWp = new Map<
    string,
    {
      readonly earlyStart: IsoDate | null;
      readonly earlyFinish: IsoDate | null;
      readonly durationDays: number | null;
      readonly plannedMh: bigint;
    }
  >();
  for (let i = 0; i < input.pinnedInputs.wps.length; i += 1) {
    const wp = input.pinnedInputs.wps[i]!;
    const out = input.pinnedOutputs.wps[i];
    pinByWp.set(wp.id, {
      earlyStart: out?.earlyStart ?? null,
      earlyFinish: out?.earlyFinish ?? null,
      durationDays: wp.durationDays,
      plannedMh: wp.plannedMh,
    });
  }

  return input.baselineWps.map((b) => {
    const pin = pinByWp.get(b.wpId);
    if (pin === undefined) {
      return {
        wpId: b.wpId,
        startDeltaDays: null,
        finishDeltaDays: null,
        durationDeltaDays: null,
        effortDeltaMh: null,
        pinEarlyStart: null,
        pinEarlyFinish: null,
        pinDurationDays: null,
        pinPlannedMh: null,
      };
    }
    const baselineDuration = durationDaysFromDates(b.start, b.finish, calendar);
    return {
      wpId: b.wpId,
      // Divergence = pin − baseline (how the pin differs from the cost projection).
      startDeltaDays: signedDateDeltaDays(b.start, pin.earlyStart, calendar),
      finishDeltaDays: signedDateDeltaDays(b.finish, pin.earlyFinish, calendar),
      durationDeltaDays: signedIntDelta(baselineDuration, pin.durationDays),
      effortDeltaMh: signedMhDelta(b.baselineMh, pin.plannedMh),
      pinEarlyStart: pin.earlyStart,
      pinEarlyFinish: pin.earlyFinish,
      pinDurationDays: pin.durationDays,
      pinPlannedMh: pin.plannedMh,
    };
  });
}

/**
 * Plan columns: active Baseline (`baseline_wp` + pin duration) vs Current Plan figures.
 * Match by `wp_id`. Summary / missing Baseline side → nulls (UI shows —).
 */
export function planBaselineCompare(input: {
  readonly wpId: string;
  readonly isLeaf: boolean;
  readonly baseline: BaselineWpCostProjection | null;
  /** Baseline duration from the active version's pinned run `inputs.durationDays`. */
  readonly baselineDurationDays: number | null;
  readonly derivedStart: IsoDate | null;
  readonly derivedFinish: IsoDate | null;
  readonly durationDays: number | null;
  readonly plannedMh: bigint | null;
  readonly calendar: CalendarVersion | null;
}): PlanBaselineCompare {
  // Leaf-only baseline_wp: summary rows keep Baseline-side N/A.
  const baselineStart = input.isLeaf ? (input.baseline?.start ?? null) : null;
  const baselineFinish = input.isLeaf ? (input.baseline?.finish ?? null) : null;
  const baselineDurationDays = input.isLeaf ? input.baselineDurationDays : null;
  const baselineMh = input.isLeaf ? (input.baseline?.baselineMh ?? null) : null;

  return {
    wpId: input.wpId,
    baselineStart,
    baselineFinish,
    baselineDurationDays,
    baselineMh,
    derivedStart: input.derivedStart,
    derivedFinish: input.derivedFinish,
    durationDays: input.durationDays,
    plannedMh: input.plannedMh,
    startDeltaDays: signedDateDeltaDays(baselineStart, input.derivedStart, input.calendar),
    finishDeltaDays: signedDateDeltaDays(baselineFinish, input.derivedFinish, input.calendar),
    durationDeltaDays: signedIntDelta(baselineDurationDays, input.durationDays),
    effortDeltaMh: signedMhDelta(baselineMh, input.plannedMh),
  };
}
