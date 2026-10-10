import { addWorkingDays, nextWorkingDay, workingDaysBetween } from './calendar';
import { compareRatio } from './health';
import { ceilDiv, mhAmountOrZero, ZERO } from './units';
/** Signed whole-working-day gap: trend later than computed → positive. */
export function finishGapWorkingDays(computed, trend, cal) {
    if (computed === trend)
        return 0;
    if (trend > computed)
        return workingDaysBetween(computed, trend, cal) - 1;
    return -(workingDaysBetween(trend, computed, cal) - 1);
}
function emptyForecast(evm, baselineStart, baselineFinish, note, computedFinish) {
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
export function computeForecast(evm, baseline, asOf, cal, opts = {}) {
    const starts = baseline.wps.map((w) => w.start).sort();
    const finishes = baseline.wps.map((w) => w.finish).sort();
    const minWpStart = starts[0] ?? null;
    const baselineFinish = finishes[finishes.length - 1] ?? null;
    // Prefer Baseline-pinned Project start; fall back to earliest Baseline WP start.
    const baselineStart = opts.baselineProjectStart ?? minWpStart;
    const computedFinish = opts.computedFinish ?? null;
    const note = 'Trend heuristic, not a PMI formula.';
    if (!baselineStart ||
        !baselineFinish ||
        baselineStart > baselineFinish ||
        evm.spi.kind !== 'value' ||
        compareRatio(evm.spi.value, ZERO) <= 0) {
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
        if (finish < floorDate)
            finish = floorDate;
    }
    let finishGapWd = null;
    if (computedFinish !== null && computedFinish !== finish) {
        const gap = finishGapWorkingDays(computedFinish, finish, cal);
        // Defensive: never show zero-gap chrome for unequal ISO dates.
        if (gap !== 0)
            finishGapWd = gap;
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
