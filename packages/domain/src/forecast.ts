import { addWorkingDays, nextWorkingDay, workingDaysBetween, type HolidayCalendar, type IsoDate } from './calendar';
import type { EvmResult } from './evm';
import { compareRatio } from './health';
import type { BaselineVersion } from './types';
import { ceilDiv, mhAmountOrZero, ZERO } from './units';

/**
 * FR-32: forecast effort at completion (the EAC from the Project's EAC Method) and both
 * finish dates — the scheduler's computed finish and the SPI-trend finish. The trend date is a
 * heuristic, not a PMI formula. `forecastFinish` remains the trend ISO date (golden continuity).
 */
export interface ForecastResult {
  eacMh: EvmResult['eacMh'];
  /** Trend finish (SPI heuristic). Alias of `trendFinish`. */
  forecastFinish: IsoDate | null;
  /** Same ISO date as `forecastFinish` — explicit trend label for dual-finish UI. */
  trendFinish: IsoDate | null;
  /** Scheduler output (`ScheduleOutputs.computedFinish` / FR-6b). Never Project finish / Float anchor. */
  computedFinish: IsoDate | null;
  /**
   * Whole working days between computed and trend (signed: trend later than computed → positive).
   * Null when either date is missing or the ISO dates are equal (no disagreement chrome).
   */
  finishGapWd: number | null;
  baselineStart: IsoDate | null;
  baselineFinish: IsoDate | null;
  note: string;
}

export interface ComputeForecastOptions {
  /** Head / pinned `schedule_run.outputs.computedFinish`. Absent/null → computed finish stays null. */
  readonly computedFinish?: IsoDate | null;
  /**
   * Project start pinned in the active Baseline's `schedule_run.inputs.projectStart`.
   * When null/absent, fall back to the earliest Baseline WP start.
   */
  readonly baselineProjectStart?: IsoDate | null;
}

/** Signed whole-working-day gap: trend later than computed → positive. */
export function finishGapWorkingDays(
  computed: IsoDate,
  trend: IsoDate,
  cal: HolidayCalendar,
): number {
  if (computed === trend) return 0;
  if (trend > computed) return workingDaysBetween(computed, trend, cal) - 1;
  return -(workingDaysBetween(trend, computed, cal) - 1);
}

function emptyForecast(
  evm: EvmResult,
  baselineStart: IsoDate | null,
  baselineFinish: IsoDate | null,
  note: string,
  computedFinish: IsoDate | null,
): ForecastResult {
  return {
    eacMh: evm.eacMh,
    forecastFinish: null,
    trendFinish: null,
    computedFinish,
    finishGapWd: null,
    baselineStart,
    baselineFinish,
    note,
  };
}

export function computeForecast(
  evm: EvmResult,
  baseline: BaselineVersion,
  asOf: IsoDate,
  cal: HolidayCalendar,
  opts: ComputeForecastOptions = {},
): ForecastResult {
  const starts = baseline.wps.map((w) => w.start).sort();
  const finishes = baseline.wps.map((w) => w.finish).sort();
  const minWpStart = starts[0] ?? null;
  const baselineFinish = finishes[finishes.length - 1] ?? null;
  // Prefer Baseline-pinned Project start; fall back to earliest Baseline WP start.
  const baselineStart = opts.baselineProjectStart ?? minWpStart;
  const computedFinish = opts.computedFinish ?? null;

  const note = 'Trend heuristic, not a PMI formula.';
  if (
    !baselineStart ||
    !baselineFinish ||
    baselineStart > baselineFinish ||
    evm.spi.kind !== 'value' ||
    compareRatio(evm.spi.value, ZERO) <= 0
  ) {
    return emptyForecast(evm, baselineStart, baselineFinish, note, computedFinish);
  }
  const durationWd = workingDaysBetween(baselineStart, baselineFinish, cal);
  // AD-27: whole working days, the ceiling of duration ÷ SPI taken over the exact Ratio.
  const spi = evm.spi.value;
  const stretched = Number(ceilDiv(BigInt(durationWd) * spi.den, spi.num));
  let finish = addWorkingDays(baselineStart, Math.max(stretched - 1, 0), cal);
  // FR-32: while EV < BAC the forecast is never earlier than the next working day.
  if (mhAmountOrZero(evm.evMh) < evm.bacMh) {
    const floorDate = nextWorkingDay(asOf, cal);
    if (finish < floorDate) finish = floorDate;
  }

  let finishGapWd: number | null = null;
  if (computedFinish !== null && computedFinish !== finish) {
    const gap = finishGapWorkingDays(computedFinish, finish, cal);
    // Defensive: never show zero-gap chrome for unequal ISO dates.
    if (gap !== 0) finishGapWd = gap;
  }

  return {
    eacMh: evm.eacMh,
    forecastFinish: finish,
    trendFinish: finish,
    computedFinish,
    finishGapWd,
    baselineStart,
    baselineFinish,
    note,
  };
}
