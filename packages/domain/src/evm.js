import { addDays, isWorkingDay, workingDaysBetween, } from './calendar';
import { compareRatio } from './health';
import { DEFAULT_RESOLVED_STATUS_IDS, isResolvedStatus, } from './types';
import { allocateLargestRemainder, divRoundHalfEven, maxBigint, mhValue, ONE, ratio, ratioValue, sum, unavailable, ZERO, } from './units';
/**
 * FR-30: EVM in effort hours. Pure. Every figure is compute(inputs, formulaVersion).
 *
 * AD-4: every quantity is exact — `bigint` milli-hours and unreduced `Ratio`s. PV is allocated by
 * largest remainder over day×resource cells (story 6.2); EV and EAC are ONE `divRoundHalfEven`
 * from their exact quotient. Nothing here rounds for display.
 *
 * Story 5.7 / FR-27: PV/EV/SV/AC are metrics (value+coverage or unavailable). AC-family is
 * unavailable in Ticket-Count Mode; mixed Projects pass hours-only AC with a coverage caption.
 */
/** Story 6.1 golden key — half-even PV; kept executable after the 6.2 largest-remainder bump. */
export const LEGACY_FORMULA_VERSION = 'evm-2026-09-20';
/**
 * Story 6.2 / 6.4 key — largest-remainder PV + EV-fall + Observed-vs-Recorded inputs.
 * Kept executable after the 6.5 Health resolve / Schedule-rule bump (Q3-A).
 */
export const PRIOR_FORMULA_VERSION = 'evm-2026-10-10';
/** Current formula key (story 6.5: Health resolve + Schedule Float/MFO/derived-slip in Review). */
export const FORMULA_VERSION = 'evm-2026-10-11';
/** Anonymous resource bucket when a WP has no `assignedResourceIds` (day-only LR). */
const ANONYMOUS_RESOURCE_ID = '';
/** Inclusive working days in `[start, finish]` under `cal`. */
function workingDaysInclusive(start, finish, cal) {
    const days = [];
    for (let d = start; d <= finish; d = addDays(d, 1)) {
        if (isWorkingDay(d, cal))
            days.push(d);
    }
    return days;
}
/**
 * Story 6.1 / legacy: PV = Baseline hours × elapsed/total via half-even (no resource axis).
 * Kept so `evm-2026-09-20` goldens stay byte-stable.
 */
export function plannedValueLegacy(baselineMh, start, finish, asOf, cal) {
    const total = workingDaysBetween(start, finish, cal);
    if (total === 0)
        return asOf >= finish ? baselineMh : 0n;
    if (asOf < start)
        return 0n;
    if (asOf >= finish)
        return baselineMh;
    const elapsed = workingDaysBetween(start, asOf, cal);
    return divRoundHalfEven(baselineMh * BigInt(elapsed), BigInt(total));
}
/**
 * FR-30 / AD-4 / Q2-A: PV = sum of largest-remainder day×resource cells with `date ≤ asOf`.
 * Resources = live `assignedResourceIds` (sorted); empty → one anonymous bucket (day-only LR).
 */
export function plannedValueLargestRemainder(baselineMh, start, finish, asOf, cal, assignedResourceIds) {
    // Before empty-days / finish checks: inverted windows (start > finish) must not treat
    // asOf ≥ finish as "full BAC" when asOf is still before start.
    if (asOf < start)
        return 0n;
    const days = workingDaysInclusive(start, finish, cal);
    if (days.length === 0)
        return asOf >= finish ? baselineMh : 0n;
    if (asOf >= finish)
        return baselineMh;
    const resources = assignedResourceIds.length === 0
        ? [ANONYMOUS_RESOURCE_ID]
        : [...new Set(assignedResourceIds)].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    const cells = days.flatMap((date) => resources.map((resourceId) => ({ date, resourceId })));
    const amounts = allocateLargestRemainder(baselineMh, cells);
    let pv = 0n;
    for (let i = 0; i < cells.length; i += 1) {
        if (cells[i].date <= asOf)
            pv += amounts[i];
    }
    return pv;
}
/**
 * FR-30: PV for the active `formulaVersion`. Legacy half-even for `evm-2026-09-20`;
 * largest-remainder day×resource otherwise.
 */
export function plannedValue(baselineMh, start, finish, asOf, cal, assignedResourceIds = [], formulaVersion = FORMULA_VERSION) {
    if (formulaVersion === LEGACY_FORMULA_VERSION) {
        return plannedValueLegacy(baselineMh, start, finish, asOf, cal);
    }
    return plannedValueLargestRemainder(baselineMh, start, finish, asOf, cal, assignedResourceIds);
}
/** FR-30's 99% cap, as an exact constant. */
const PCT_CAP = { num: 99n, den: 100n };
/** FR-30: Percent Complete is never derived from burned effort. */
export function percentComplete(tickets, baselineMh, completed, resolvedStatusIds = DEFAULT_RESOLVED_STATUS_IDS) {
    if (tickets.length === 0)
        return { pct: ZERO, basis: 'no-evidence', lowEvidence: true };
    const lowEvidence = tickets.length < 3;
    const allEstimated = tickets.every((t) => t.estimateMh !== null && t.estimateMh > 0n);
    const resolved = (t) => isResolvedStatus(t.statusId, resolvedStatusIds);
    let pct;
    let basis;
    if (allEstimated) {
        basis = 'estimate';
        const resolvedEst = sum(tickets.filter(resolved).map((t) => t.estimateMh ?? 0n));
        const totalEst = sum(tickets.map((t) => t.estimateMh ?? 0n));
        const denom = maxBigint(baselineMh, totalEst);
        pct = denom === 0n ? ZERO : ratio(resolvedEst, denom);
    }
    else {
        basis = 'count';
        pct = ratio(BigInt(tickets.filter(resolved).length), BigInt(tickets.length));
    }
    // FR-30: capped at 99% until the PM marks the WP complete.
    if (!completed && compareRatio(pct, PCT_CAP) > 0)
        pct = PCT_CAP;
    if (compareRatio(pct, ZERO) < 0)
        pct = ZERO;
    if (compareRatio(pct, ONE) > 0)
        pct = ONE;
    return { pct, basis, lowEvidence };
}
/**
 * FR-30: "the PM marked the WP complete" is an actual finish on a WP that is not a milestone. A
 * milestone's actual finish is its done date, which lifts no cap.
 */
export const isMarkedComplete = (wp) => !wp.isMilestone && wp.actualFinish !== null;
export function computeEvm(input) {
    const resolvedStatusIds = input.resolvedStatusIds ?? DEFAULT_RESOLVED_STATUS_IDS;
    const formulaVersion = input.formulaVersion ?? FORMULA_VERSION;
    const wpById = new Map(input.wps.map((w) => [w.id, w]));
    const perWp = [];
    for (const b of input.baseline.wps) {
        const wp = wpById.get(b.wpId);
        if (!wp)
            continue;
        const tickets = input.mappedTicketsByWp.get(b.wpId) ?? [];
        const pv = plannedValue(b.baselineMh, b.start, b.finish, input.asOf, input.calendar, wp.assignedResourceIds, formulaVersion);
        // Glossary: a Catch-all WP with Baseline hours is measured as Level of Effort,
        // so EV equals PV. Its hours beyond the Baseline are Unplanned Work (FR-24).
        // Story 5.12: LOE gate reads baseline_wp.is_catch_all — never the live WP cache (AR-22).
        const { pct, basis, lowEvidence } = b.isCatchAll && b.baselineMh > 0n
            ? {
                pct: ratio(pv, b.baselineMh),
                basis: 'loe',
                lowEvidence: false,
            }
            : percentComplete(tickets, b.baselineMh, isMarkedComplete(wp), resolvedStatusIds);
        const evMh = divRoundHalfEven(b.baselineMh * pct.num, pct.den);
        const prior = input.priorEvByWp?.get(b.wpId);
        perWp.push({
            wpId: b.wpId,
            wbsCode: wp.wbsCode,
            name: wp.name,
            baselineMh: b.baselineMh,
            pvMh: pv,
            pctComplete: pct,
            pctBasis: basis,
            lowEvidence,
            evMh,
            acMh: input.acByWp.get(b.wpId) ?? 0n,
            mappedTickets: tickets.length,
            resolvedTickets: tickets.filter((t) => isResolvedStatus(t.statusId, resolvedStatusIds)).length,
            evFell: prior !== undefined && evMh < prior,
        });
    }
    const bacMh = sum(perWp.map((w) => w.baselineMh));
    const pvRaw = sum(perWp.map((w) => w.pvMh));
    const evRaw = sum(perWp.map((w) => w.evMh));
    const acRaw = input.totalAcMh;
    const svRaw = evRaw - pvRaw;
    // FR-27 / AD-8: in Ticket-Count Mode every AC-based metric is unavailable, never 0.
    const noHours = input.measurementBasis === 'count';
    const NO_HOURS = 'tracker_provides_no_hours';
    const acCoverage = input.acCoverage ?? null;
    const ratioOrUnavailable = (num, den, reason, coverage = null) => (den === 0n ? unavailable(reason) : ratioValue(ratio(num, den), coverage));
    const pvMh = mhValue(pvRaw);
    const evMh = mhValue(evRaw);
    const svMh = mhValue(svRaw);
    const acMh = noHours ? unavailable(NO_HOURS) : mhValue(acRaw, acCoverage);
    const spi = ratioOrUnavailable(evRaw, pvRaw, 'no_planned_value_yet');
    const cpiAllIn = noHours
        ? unavailable(NO_HOURS)
        : ratioOrUnavailable(evRaw, acRaw, 'no_actuals_yet', acCoverage);
    const cpiPlanned = noHours
        ? unavailable(NO_HOURS)
        : ratioOrUnavailable(evRaw, input.plannedScopeAcMh, 'no_actuals_yet', acCoverage);
    const cvMh = noHours ? unavailable(NO_HOURS) : mhValue(evRaw - acRaw, acCoverage);
    // FR-30: EAC Typical = BAC / CPI (all-in) = BAC × AC / EV, exactly. R0's only method.
    const eacMh = cpiAllIn.kind === 'value' && compareRatio(cpiAllIn.value, ZERO) > 0
        ? mhValue(divRoundHalfEven(bacMh * cpiAllIn.value.den, cpiAllIn.value.num), acCoverage)
        : unavailable(noHours ? NO_HOURS : 'no_cpi_yet');
    const etcMh = eacMh.kind === 'value' ? mhValue(eacMh.value - acRaw, acCoverage) : unavailable(eacMh.reasonCode);
    const vacMh = eacMh.kind === 'value' ? mhValue(bacMh - eacMh.value, acCoverage) : unavailable(eacMh.reasonCode);
    const bacExhausted = !noHours && bacMh - acRaw <= 0n;
    const tcpi = noHours
        ? unavailable(NO_HOURS)
        : bacExhausted
            ? unavailable('bac_exhausted')
            : ratioValue(ratio(bacMh - evRaw, bacMh - acRaw), acCoverage);
    return {
        formulaVersion,
        perWp,
        bacMh,
        pvMh,
        evMh,
        acMh,
        svMh,
        spi,
        cvMh,
        cpiAllIn,
        cpiPlannedScope: cpiPlanned,
        eacMh,
        etcMh,
        vacMh,
        tcpi,
        bacExhausted,
    };
}
