import { ratioText, share, thresholdText } from './present';
import { DEFAULT_THRESHOLDS } from './types';
import { ONE } from './units';
/**
 * AD-4: THE ONLY PLACE A RATIO MEETS A THRESHOLD. Exact, by cross-multiplication —
 * `spi ≥ 95/100` is `spi.num × 100 ≥ spi.den × 95` — so a value sitting exactly on a boundary
 * lands on the side the rule says, where a float could land on either. Neither side is
 * reduced first, and a negative denominator is handled rather than assumed away.
 *
 * Returns -1, 0 or 1 as `a` is below, equal to or above `b`.
 */
export function compareRatio(a, b) {
    const difference = a.num * b.den - b.num * a.den;
    const signedDen = a.den * b.den;
    const d = signedDen < 0n ? -difference : difference;
    return d < 0n ? -1 : d > 0n ? 1 : 0;
}
/** The Review's "behind plan" wording: SPI strictly below 1, compared exactly. */
export const isBehindPlan = (spi) => spi.kind === 'value' && compareRatio(spi.value, ONE) < 0;
const THRESHOLD_KEYS = [
    'ratioGreen',
    'ratioAmber',
    'tcpiRed',
    'unplannedGreenBelow',
    'unplannedAmberMax',
];
/**
 * Resolve Health thresholds: Project override (partial keys fall through) else Tenant
 * default else `DEFAULT_THRESHOLDS`. One function in `domain/health` (FR-31, AR-19, A1).
 */
export function resolveThresholds(args) {
    const sources = {};
    const thresholds = {};
    let anyProject = false;
    let anyTenant = false;
    for (const key of THRESHOLD_KEYS) {
        const fromProject = args.projectOverride?.[key];
        if (fromProject != null) {
            thresholds[key] = fromProject;
            sources[key] = 'project';
            anyProject = true;
            continue;
        }
        const fromTenant = args.tenantDefaults?.[key];
        if (fromTenant != null) {
            thresholds[key] = fromTenant;
            sources[key] = 'tenant';
            anyTenant = true;
            continue;
        }
        thresholds[key] = DEFAULT_THRESHOLDS[key];
        sources[key] = 'default';
    }
    const source = anyProject ? 'project' : anyTenant ? 'tenant' : 'default';
    return { thresholds, sources, source };
}
const ratioColour = (v, t) => compareRatio(v, t.ratioGreen) >= 0 ? 'green' : compareRatio(v, t.ratioAmber) >= 0 ? 'amber' : 'red';
const worse = (a, b) => {
    const rank = { green: 0, unavailable: 1, amber: 2, red: 3 };
    return rank[a] >= rank[b] ? a : b;
};
function indicator(key, colour, driver, rule) {
    return { key, colour, driver, rule, disclosure: `${rule} · driver ${driver}` };
}
export function computeHealth(input) {
    const { evm, thresholds: t } = input;
    const feed = input.scheduleFeed ?? null;
    // --- Schedule: SPI + milestones + Float / MFO / derived-slip (FR-31)
    let schedule;
    if (evm === null) {
        schedule = indicator('schedule', 'unavailable', '—', NO_BASELINE_RULE);
    }
    else {
        let colour;
        let rule;
        let driver;
        if (evm.spi.kind === 'value') {
            colour = ratioColour(evm.spi.value, t);
            rule = `${colour === 'green' ? 'Green' : colour === 'amber' ? 'Amber' : 'Red'} because SPI ${fmt(evm.spi)} ${ruleText(evm.spi.value, t)}`;
            driver = `SPI ${fmt(evm.spi)}`;
        }
        else {
            colour = 'unavailable';
            rule = `SPI unavailable (${evm.spi.reasonCode})`;
            driver = '—';
        }
        const calendarSlipped = input.slippedMilestones.length > 0;
        const derivedSlipped = (feed?.derivedSlippedMilestones.length ?? 0) > 0;
        /** True once a Schedule extra (milestone / MFO) has named itself in `rule`. */
        let namedExtra = false;
        // Milestone calendar slip → at least amber; names the rule.
        if (calendarSlipped && (colour === 'green' || colour === 'unavailable')) {
            colour = 'amber';
        }
        // Milestone derived slip → at least amber; names which rule(s).
        if (derivedSlipped && (colour === 'green' || colour === 'unavailable')) {
            colour = 'amber';
        }
        if (calendarSlipped || derivedSlipped) {
            const parts = [];
            if (calendarSlipped) {
                parts.push(`calendar Milestone slip (${input.slippedMilestones.length} past Baseline, not done)`);
            }
            if (derivedSlipped) {
                const sample = feed.derivedSlippedMilestones[0];
                parts.push(`derived-date Milestone slip (${feed.derivedSlippedMilestones.length}; e.g. ${sample.wbsCode} derived ${sample.derivedDate} > Baseline ${sample.baselineDate})`);
            }
            const both = calendarSlipped && derivedSlipped;
            rule = `${cap(colour)} because ${both ? 'both milestone rules: ' : ''}${parts.join('; ')}`;
            namedExtra = true;
        }
        // Unmet MFO → ≥ amber; red when the worst (first) violation is a Milestone.
        const mfo = feed?.mfoViolations ?? [];
        if (mfo.length > 0) {
            const worst = mfo[0];
            const mfoColour = worst.isMilestone ? 'red' : 'amber';
            colour = worse(colour, mfoColour);
            const mfoCause = `unmet must-finish-on on ${worst.wbsCode} ${worst.name} (${worst.daysLate} working day(s) late)${worst.isMilestone ? ' — Milestone' : ''}`;
            rule = namedExtra
                ? `${cap(colour)} because ${stripBecause(rule)}; ${mfoCause}`
                : `${cap(colour)} because ${mfoCause}`;
            driver = `MFO ${worst.daysLate}d late · ${driver}`;
            namedExtra = true;
        }
        // Negative Float vs Project finish → red; relative Float cannot fire and says so.
        if (feed != null) {
            if (feed.floatAnchorKind === 'computed_finish') {
                // Relative Float: rule cannot fire; always say so (whatever the colour).
                rule = `${rule}; Float is relative to computed finish — negative-Float rule cannot fire (plan not implied safe)`;
            }
            else if (feed.floatAnchorKind === 'project_finish' &&
                feed.minFloatDays !== null &&
                feed.minFloatDays < 0) {
                colour = 'red';
                const floatCause = `Project minimum Float is ${feed.minFloatDays} working day(s) (vs Project finish)`;
                rule = namedExtra
                    ? `Red because ${stripBecause(rule)}; ${floatCause}`
                    : `Red because ${floatCause}`;
                driver = `Float ${feed.minFloatDays} · ${driver}`;
            }
        }
        schedule = indicator('schedule', colour, driver, rule);
    }
    // --- Effort/Cost: all-in CPI + TCPI. TCPI crossing is red whatever the CPI.
    let effort;
    if (evm === null) {
        effort = indicator('effort_cost', 'unavailable', '—', NO_BASELINE_RULE);
    }
    else if (evm.cpiAllIn.kind === 'value') {
        let colour = ratioColour(evm.cpiAllIn.value, t);
        let rule = `${cap(colour)} because CPI (all-in) ${fmt(evm.cpiAllIn)} ${ruleText(evm.cpiAllIn.value, t)}`;
        const tcpiCrossed = evm.bacExhausted || (evm.tcpi.kind === 'value' && compareRatio(evm.tcpi.value, t.tcpiRed) > 0);
        let driver = `CPI ${fmt(evm.cpiAllIn)}`;
        if (tcpiCrossed) {
            colour = 'red';
            const cpiBeside = `CPI ${fmt(evm.cpiAllIn)}`;
            if (evm.bacExhausted) {
                rule = `Red because BAC is exhausted (BAC − AC ≤ 0); ${cpiBeside} shown beside TCPI`;
                driver = `${cpiBeside} · TCPI — (BAC exhausted)`;
            }
            else {
                rule = `Red because TCPI ${fmt(evm.tcpi)} > ${thresholdText(t.tcpiRed)} — the remaining work must beat the planned efficiency; ${cpiBeside} shown beside TCPI`;
                driver = `${cpiBeside} · TCPI ${fmt(evm.tcpi)}`;
            }
        }
        effort = indicator('effort_cost', colour, driver, rule);
    }
    else {
        effort = indicator('effort_cost', 'unavailable', '—', input.measurementBasis === 'count'
            ? 'Unavailable — tracker provides no hours (Ticket-Count Mode)'
            : `Unavailable (${evm.cpiAllIn.reasonCode})`);
    }
    // --- Unplanned Work: the Reporting Period's share; cumulative shown beside.
    let unplanned;
    if (evm === null) {
        // With no Baseline every mapped hour is non-baselined, so the share would judge the missing
        // Baseline rather than the work (story 2.2, Q1-A as amended): shown, not coloured.
        unplanned = indicator('unplanned', 'unavailable', '—', NO_BASELINE_RULE);
    }
    else if (input.unplannedSharePeriod === null) {
        unplanned = indicator('unplanned', 'unavailable', '—', input.measurementBasis === 'count'
            ? 'Unavailable — no Tickets first observed or Resolved in this Reporting Period'
            : 'Unavailable — no actual work in this Reporting Period');
    }
    else {
        const s = input.unplannedSharePeriod;
        const colour = compareRatio(s, t.unplannedGreenBelow) < 0
            ? 'green'
            : compareRatio(s, t.unplannedAmberMax) <= 0
                ? 'amber'
                : 'red';
        const pct = share;
        const unitLabel = input.measurementBasis === 'count' ? "period's Tickets" : "period's hours";
        const cum = input.unplannedShareCumulative !== null
            ? ` (cumulative ${pct(input.unplannedShareCumulative)})`
            : '';
        const driver = `${pct(s)}${cum}`;
        const rule = colour === 'green'
            ? `Green because ${pct(s)} < ${pct(t.unplannedGreenBelow)} of this ${unitLabel}`
            : colour === 'amber'
                ? `Amber because ${pct(t.unplannedGreenBelow)} ≤ ${pct(s)} ≤ ${pct(t.unplannedAmberMax)}`
                : `Red because ${pct(s)} > ${pct(t.unplannedAmberMax)}`;
        unplanned = indicator('unplanned', colour, driver, rule);
    }
    const indicators = [schedule, effort, unplanned];
    const overall = indicators.map((i) => i.colour).reduce(worse, 'green');
    const unavailableOnes = indicators.filter((i) => i.colour === 'unavailable');
    return {
        indicators,
        overall,
        overallNote: unavailableOnes.length > 0
            ? `${unavailableOnes.map((i) => label(i.key)).join(', ')} unavailable`
            : null,
    };
}
const NO_BASELINE_RULE = 'Unavailable — no Baseline yet';
/** Drop the leading "Green/Amber/Red/Unavailable because " so causes can be recomposed. */
const stripBecause = (rule) => rule.replace(/^(Green|Amber|Red|Unavailable) because /i, '');
const label = (k) => k === 'schedule' ? 'Schedule' : k === 'effort_cost' ? 'Effort/Cost' : 'Unplanned Work';
const cap = (c) => c.charAt(0).toUpperCase() + c.slice(1);
const fmt = (m) => (m.kind === 'value' ? ratioText(m.value) : '—');
const ruleText = (v, t) => compareRatio(v, t.ratioGreen) >= 0
    ? `≥ ${thresholdText(t.ratioGreen)}`
    : compareRatio(v, t.ratioAmber) >= 0
        ? `is between ${thresholdText(t.ratioAmber)} and ${thresholdText(t.ratioGreen)}`
        : `< ${thresholdText(t.ratioAmber)}`;
