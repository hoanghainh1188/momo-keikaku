import { addWorkingDays, nextWorkingDay, workingDaysBetween, type HolidayCalendar, type IsoDate } from './calendar';
import type { EvmResult } from './evm';
import { compareRatio } from './health';
import type { BaselineVersion } from './types';
import { ceilDiv, mhAmountOrZero, ZERO } from './units';

/**
 * FR-32: forecast effort at completion (the EAC from the Project's EAC Method) and a
 * forecast finish date. The finish date is a trend heuristic, not a PMI formula.
 */
export interface ForecastResult {
  eacMh: EvmResult['eacMh'];
  forecastFinish: IsoDate | null;
  baselineStart: IsoDate | null;
  baselineFinish: IsoDate | null;
  note: string;
}

export function computeForecast(
  evm: EvmResult,
  baseline: BaselineVersion,
  asOf: IsoDate,
  cal: HolidayCalendar,
): ForecastResult {
  const starts = baseline.wps.map((w) => w.start).sort();
  const finishes = baseline.wps.map((w) => w.finish).sort();
  const baselineStart = starts[0] ?? null;
  const baselineFinish = finishes[finishes.length - 1] ?? null;

  const note = 'Trend heuristic, not a PMI formula.';
  if (
    !baselineStart ||
    !baselineFinish ||
    evm.spi.kind !== 'value' ||
    compareRatio(evm.spi.value, ZERO) <= 0
  ) {
    return { eacMh: evm.eacMh, forecastFinish: null, baselineStart, baselineFinish, note };
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
  return { eacMh: evm.eacMh, forecastFinish: finish, baselineStart, baselineFinish, note };
}
