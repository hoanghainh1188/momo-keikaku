/**
 * Story 6.3: formula popover helpers — interpretations, Period Δ, WP drill-down.
 * Pure over EVM outputs; no I/O.
 */
import { addDays } from './calendar';
import { compareRatio } from './health';
import { ratio, reduce } from './units';
export function priorAsOfForPeriod(periodStart) {
    return addDays(periodStart, -1);
}
export function isAcDerivedMetric(id) {
    return (id === 'ac' ||
        id === 'cv' ||
        id === 'cpi_all_in' ||
        id === 'cpi_planned' ||
        id === 'tcpi' ||
        id === 'etc');
}
export function interpretationKeyForMetric(id, evm) {
    if (id === 'tcpi' && evm.bacExhausted)
        return 'bac_exhausted';
    switch (id) {
        case 'cv':
            return mhInterpretation(evm.cvMh, 'cv_under', 'cv_over', 'cv_on');
        case 'sv':
            return mhInterpretation(evm.svMh, 'sv_ahead', 'sv_behind', 'sv_on');
        case 'cpi_all_in':
        case 'cpi_planned':
            return ratioInterpretation(id === 'cpi_all_in' ? evm.cpiAllIn : evm.cpiPlannedScope, 'cpi_under', 'cpi_over', 'cpi_on');
        case 'spi':
            return ratioInterpretation(evm.spi, 'spi_ahead', 'spi_behind', 'spi_on');
        case 'tcpi':
            return tcpiInterpretation(evm.tcpi);
        default:
            return 'neutral';
    }
}
function mhInterpretation(m, positiveKey, negativeKey, zeroKey) {
    if (m.kind === 'unavailable')
        return 'unavailable';
    if (m.value > 0n)
        return positiveKey;
    if (m.value < 0n)
        return negativeKey;
    return zeroKey;
}
function ratioInterpretation(m, aboveKey, belowKey, onKey) {
    if (m.kind === 'unavailable')
        return 'unavailable';
    const cmp = compareRatio(m.value, ratio(1n, 1n));
    if (cmp > 0)
        return aboveKey;
    if (cmp < 0)
        return belowKey;
    return onKey;
}
function tcpiInterpretation(m) {
    if (m.kind === 'unavailable')
        return m.reasonCode === 'bac_exhausted' ? 'bac_exhausted' : 'unavailable';
    const cmp = compareRatio(m.value, ratio(1n, 1n));
    if (cmp > 0)
        return 'tcpi_must_beat';
    if (cmp < 0)
        return 'tcpi_efficient';
    return 'tcpi_on';
}
export function drillDownRowsForMetric(id, evm, ticketKeysByWp) {
    const includeTickets = isAcDerivedMetric(id);
    const rows = evm.perWp
        .map((wp) => {
        const contributionMh = wpContributionMh(id, wp, evm);
        const ticketKeys = includeTickets ? [...(ticketKeysByWp.get(wp.wpId) ?? [])] : [];
        return {
            wpId: wp.wpId,
            wbsCode: wp.wbsCode,
            name: wp.name,
            contributionMh,
            ticketKeys,
        };
    })
        .filter((r) => r.contributionMh !== 0n || r.ticketKeys.length > 0);
    rows.sort((a, b) => a.wbsCode.localeCompare(b.wbsCode));
    return rows;
}
function wpContributionMh(id, wp, evm) {
    switch (id) {
        case 'pv':
            return wp.pvMh;
        case 'ev':
            return wp.evMh;
        case 'ac':
            return wp.acMh;
        case 'bac':
            return wp.baselineMh;
        case 'cv':
            return wp.evMh - wp.acMh;
        case 'sv':
            return wp.evMh - wp.pvMh;
        case 'cpi_all_in':
        case 'cpi_planned':
        case 'tcpi':
        case 'spi':
            return wp.evMh;
        case 'eac':
        case 'etc':
        case 'vac':
            return wp.evMh;
        default:
            return wp.evMh;
    }
}
/** Exact rational difference current − prior for ratio metrics; mh for hour metrics. */
export function periodDeltaRational(id, current, prior) {
    if (prior === null)
        return { kind: 'unavailable' };
    const mhDelta = (cur, prev) => {
        if (cur.kind === 'unavailable' || prev.kind === 'unavailable')
            return { kind: 'unavailable' };
        return { kind: 'mh', delta: cur.value - prev.value };
    };
    const ratioDelta = (cur, prev) => {
        if (cur.kind === 'unavailable' || prev.kind === 'unavailable')
            return { kind: 'unavailable' };
        const { num, den } = reduce(ratio(cur.value.num * prev.value.den - prev.value.num * cur.value.den, cur.value.den * prev.value.den));
        return { kind: 'ratio', delta: { num, den } };
    };
    switch (id) {
        case 'pv':
            return mhDelta(current.pvMh, prior.pvMh);
        case 'ev':
            return mhDelta(current.evMh, prior.evMh);
        case 'ac':
            return mhDelta(current.acMh, prior.acMh);
        case 'cv':
            return mhDelta(current.cvMh, prior.cvMh);
        case 'sv':
            return mhDelta(current.svMh, prior.svMh);
        case 'cpi_all_in':
            return ratioDelta(current.cpiAllIn, prior.cpiAllIn);
        case 'cpi_planned':
            return ratioDelta(current.cpiPlannedScope, prior.cpiPlannedScope);
        case 'spi':
            return ratioDelta(current.spi, prior.spi);
        case 'tcpi':
            if (current.bacExhausted || prior.bacExhausted)
                return { kind: 'unavailable' };
            return ratioDelta(current.tcpi, prior.tcpi);
        case 'bac':
            return { kind: 'mh', delta: current.bacMh - prior.bacMh };
        case 'eac':
            return mhDelta(current.eacMh, prior.eacMh);
        case 'etc':
            return mhDelta(current.etcMh, prior.etcMh);
        case 'vac':
            return mhDelta(current.vacMh, prior.vacMh);
        default:
            return { kind: 'unavailable' };
    }
}
