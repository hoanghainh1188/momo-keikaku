import { describe, expect, it } from 'vitest';
import { buildCalendar } from './calendar';
import { FORMULA_VERSION, LEGACY_FORMULA_VERSION, computeEvm, isMarkedComplete, percentComplete, plannedValue, plannedValueLargestRemainder, plannedValueLegacy, } from './evm';
import { computeHealth } from './health';
import { DEFAULT_THRESHOLDS } from './types';
import { hoursToMh, ratio } from './units';
/** A Ratio metric, exactly as carried — unreduced. */
const ratioMetric = (num, den) => ({ kind: 'value', value: ratio(num, den), unit: 'ratio', coverage: null });
const mhMetric = (value) => ({ kind: 'value', value, unit: 'mh', coverage: null });
/**
 * Golden EVM cases, hand-computed from the PMI formulas in docs/references
 * (FR-30) so the numbers can be checked without running the code.
 */
const cal = buildCalendar('test', { jp: false, vn: false }); // weekends only
const wp = (over) => ({
    wbsCode: over.id,
    name: over.id,
    parentId: null,
    isLeaf: true,
    isMilestone: false,
    isCatchAll: false,
    plannedMh: 0n,
    actualStart: null,
    actualFinish: null,
    assignedResourceIds: [],
    ...over,
});
const ticket = (id, estimateHours, resolved) => ({
    trackerIssueId: id,
    key: id,
    title: id,
    statusId: resolved ? 'Closed' : 'Open',
    estimateMh: estimateHours === null ? null : hoursToMh(estimateHours),
    actualMh: 0n,
    assigneeAccountId: null,
    createdAt: '2026-06-01T00:00:00.000Z',
    parentIssueId: null,
    issueTypeId: 'Task',
    trackerProjectId: null,
    attributes: [],
});
describe('plannedValue (FR-30 / AD-4: largest remainder over baseline working days)', () => {
    it('is 0 before the WP starts and the full Baseline after it finishes', () => {
        // 2026-06-01 Mon .. 2026-06-12 Fri = 10 working days
        expect(plannedValue(hoursToMh(100), '2026-06-01', '2026-06-12', '2026-05-29', cal)).toBe(0n);
        expect(plannedValue(hoursToMh(100), '2026-06-01', '2026-06-12', '2026-06-30', cal)).toBe(hoursToMh(100));
    });
    it('spreads over working days only, skipping the weekend (empty resources = day-only LR)', () => {
        // as-of Fri 2026-06-05 = 5 of 10 working days elapsed -> 50h of 100h (exact split)
        expect(plannedValue(hoursToMh(100), '2026-06-01', '2026-06-12', '2026-06-05', cal)).toBe(hoursToMh(50));
        // as-of Sun 2026-06-07 is still 5 working days elapsed -> unchanged
        expect(plannedValue(hoursToMh(100), '2026-06-01', '2026-06-12', '2026-06-07', cal)).toBe(hoursToMh(50));
    });
    it('assigns remainder milli-hours to earlier dates (tie-break), not half-even cumulative', () => {
        // 100_000 mh over 3 working days: LR → [33334, 33333, 33333]; half-even day-1 was 33333
        expect(plannedValueLargestRemainder(hoursToMh(100), '2026-06-01', '2026-06-03', '2026-06-01', cal, [])).toBe(33334n);
        expect(plannedValueLegacy(hoursToMh(100), '2026-06-01', '2026-06-03', '2026-06-01', cal)).toBe(33333n);
        expect(plannedValue(hoursToMh(100), '2026-06-01', '2026-06-03', '2026-06-01', cal, [], LEGACY_FORMULA_VERSION)).toBe(33333n);
    });
    it('splits day×resource cells with resource-id tie-break on the same date', () => {
        // 10 mh, 1 day, 2 resources → [5, 5]; with remainder 1 on 11 mh → lower id gets +1
        expect(plannedValueLargestRemainder(11n, '2026-06-01', '2026-06-01', '2026-06-01', cal, ['r-b', 'r-a'])).toBe(11n);
        // Mid-window: 2 resources × 2 working days, 10 mh → cells get 2 or 3; as-of day 1 = first date's pair
        // Sorted resources r-a, r-b; days Mon–Tue. 10/4 = 2 rem 2 → first two cells (Mon r-a, Mon r-b) get +1 → 3+3=6
        expect(plannedValueLargestRemainder(10n, '2026-06-01', '2026-06-02', '2026-06-01', cal, ['r-b', 'r-a'])).toBe(6n);
    });
    it('returns 0 when asOf is before start even if the baseline window is inverted (no working days)', () => {
        // start > finish → empty day list; asOf still before start must win over asOf ≥ finish
        expect(plannedValueLargestRemainder(hoursToMh(100), '2026-06-05', '2026-06-01', '2026-06-03', cal, [])).toBe(0n);
    });
});
describe('computeEvm — multi-resource largest-remainder PV (story 6.2 / Q2-A)', () => {
    it('uses live assignedResourceIds for mid-window pvMh', () => {
        const baseline = {
            seq: 1,
            id: 'bl-1',
            reason: 'multi-res',
            recordedAt: '2026-06-01T00:00:00.000Z',
            actor: 'user:pm',
            wps: [
                {
                    wpId: 'WP-1',
                    start: '2026-06-01',
                    finish: '2026-06-02',
                    baselineMh: 10n,
                    isMilestone: false,
                    isCatchAll: false,
                },
            ],
        };
        const r = computeEvm({
            asOf: '2026-06-01',
            calendar: cal,
            baseline,
            wps: [wp({ id: 'WP-1', assignedResourceIds: ['r-b', 'r-a'] })],
            mappedTicketsByWp: new Map(),
            acByWp: new Map(),
            unplannedAcMh: 0n,
            totalAcMh: 0n,
            plannedScopeAcMh: 0n,
            measurementBasis: 'hours',
            formulaVersion: FORMULA_VERSION,
        });
        // 10 mh / (2 days × 2 resources): rem to Mon r-a + Mon r-b → 3+3 = 6
        expect(r.perWp[0].pvMh).toBe(6n);
        expect(r.pvMh).toEqual({ kind: 'value', value: 6n, unit: 'mh', coverage: null });
    });
});
describe('computeEvm — EV fall vs priorEvByWp (story 6.2 / Q1-A)', () => {
    const baseline = {
        seq: 1,
        id: 'bl-1',
        reason: 'ev-fall',
        recordedAt: '2026-06-01T00:00:00.000Z',
        actor: 'user:pm',
        wps: [
            {
                wpId: 'WP-1',
                start: '2026-06-01',
                finish: '2026-06-12',
                baselineMh: hoursToMh(100),
                isMilestone: false,
                isCatchAll: false,
            },
        ],
    };
    const tickets = [ticket('a', 25, true), ticket('b', 25, false), ticket('c', 25, false), ticket('d', 25, false)];
    // 25% → EV = 25h
    const run = (priorEvByWp) => computeEvm({
        asOf: '2026-06-05',
        calendar: cal,
        baseline,
        wps: [wp({ id: 'WP-1' })],
        mappedTicketsByWp: new Map([['WP-1', tickets]]),
        acByWp: new Map(),
        unplannedAcMh: 0n,
        totalAcMh: hoursToMh(10),
        plannedScopeAcMh: hoursToMh(10),
        measurementBasis: 'hours',
        priorEvByWp,
        formulaVersion: FORMULA_VERSION,
    });
    it('flags a WP when current EV is strictly below a supplied prior', () => {
        const r = run(new Map([['WP-1', hoursToMh(40)]]));
        expect(r.perWp[0].evMh).toBe(hoursToMh(25));
        expect(r.perWp[0].evFell).toBe(true);
    });
    it('does not flag when prior is absent, equal, or lower', () => {
        expect(run().perWp[0].evFell).toBe(false);
        expect(run(new Map()).perWp[0].evFell).toBe(false);
        expect(run(new Map([['WP-1', hoursToMh(25)]])).perWp[0].evFell).toBe(false);
        expect(run(new Map([['WP-1', hoursToMh(10)]])).perWp[0].evFell).toBe(false);
        expect(run(new Map([['WP-OTHER', hoursToMh(99)]])).perWp[0].evFell).toBe(false);
    });
});
describe('percentComplete (FR-30: never derived from burned effort)', () => {
    it('uses the estimate basis when every mapped Ticket has an estimate', () => {
        // resolved estimate 30h; total estimate 100h; baseline 80h -> denominator 100h
        const tickets = [ticket('a', 30, true), ticket('b', 40, false), ticket('c', 30, false)];
        const r = percentComplete(tickets, hoursToMh(80), false);
        expect(r.basis).toBe('estimate');
        expect(r.pct).toEqual(ratio(hoursToMh(30), hoursToMh(100)));
    });
    it('uses the larger of Baseline hours and total estimate as the denominator', () => {
        // resolved 30h, total estimate 40h, baseline 80h -> 30/80
        const tickets = [ticket('a', 30, true), ticket('b', 10, false), ticket('c', 0.001, false)];
        const r = percentComplete(tickets, hoursToMh(80), false);
        // total estimate 40.001h < baseline 80h, so the denominator is the Baseline: 30/80, exactly.
        expect(r.pct).toEqual(ratio(hoursToMh(30), hoursToMh(80)));
    });
    it('falls back to the count basis when any mapped Ticket has no estimate', () => {
        const tickets = [ticket('a', 10, true), ticket('b', null, true), ticket('c', 10, false)];
        const r = percentComplete(tickets, hoursToMh(80), false);
        expect(r.basis).toBe('count');
        expect(r.pct).toEqual(ratio(2n, 3n));
    });
    it('caps at 99% until the PM marks the WP complete, and flags low evidence', () => {
        const tickets = [ticket('a', 10, true), ticket('b', 10, true)];
        const open = percentComplete(tickets, hoursToMh(20), false);
        expect(open.pct).toEqual(ratio(99n, 100n));
        expect(open.lowEvidence).toBe(true); // fewer than three mapped Tickets
        const done = percentComplete(tickets, hoursToMh(20), true);
        expect(done.pct).toEqual(ratio(hoursToMh(20), hoursToMh(20))); // 1, unreduced
    });
    it('reports no evidence when nothing is mapped', () => {
        const r = percentComplete([], hoursToMh(20), false);
        expect(r).toEqual({ pct: ratio(0n, 1n), basis: 'no-evidence', lowEvidence: true });
    });
});
describe('computeEvm — an actual finish lifts the 99% cap only on a non-milestone leaf', () => {
    // Every mapped Ticket resolved: 100% of the estimate, which the cap holds at 99% until the PM
    // marks the WP complete — now an actual finish on its head status event (story 2.2).
    const baseline = {
        seq: 1,
        id: 'bl-1',
        reason: 'cap',
        recordedAt: '2026-06-01T00:00:00.000Z',
        actor: 'user:pm',
        wps: [
            { wpId: 'WP-1', start: '2026-06-01', finish: '2026-06-12', baselineMh: hoursToMh(100), isMilestone: false, isCatchAll: false },
            { wpId: 'WP-M', start: '2026-06-12', finish: '2026-06-12', baselineMh: hoursToMh(100), isMilestone: true, isCatchAll: false },
        ],
    };
    const allResolved = (prefix) => [1, 2, 3, 4].map((n) => ticket(`${prefix}${n}`, 25, true));
    const measure = (wps) => computeEvm({
        asOf: '2026-06-05',
        calendar: cal,
        baseline,
        wps,
        mappedTicketsByWp: new Map([
            ['WP-1', allResolved('a')],
            ['WP-M', allResolved('m')],
        ]),
        acByWp: new Map(),
        unplannedAcMh: 0n,
        totalAcMh: hoursToMh(10),
        plannedScopeAcMh: hoursToMh(10),
        measurementBasis: 'hours',
    }).perWp;
    const done = '2026-06-05';
    it('caps both at 99% with no actual finish', () => {
        const [leaf, milestone] = measure([wp({ id: 'WP-1' }), wp({ id: 'WP-M', isMilestone: true })]);
        expect(leaf.pctComplete).toEqual(ratio(99n, 100n));
        expect(milestone.pctComplete).toEqual(ratio(99n, 100n));
    });
    it('reads a marked-complete leaf as 100%, EV = its Baseline effort; a done milestone stays capped', () => {
        const [leaf, milestone] = measure([
            wp({ id: 'WP-1', actualFinish: done }),
            wp({ id: 'WP-M', isMilestone: true, actualFinish: done }),
        ]);
        expect(leaf.pctComplete).toEqual(ratio(hoursToMh(100), hoursToMh(100)));
        expect(leaf.evMh).toBe(hoursToMh(100));
        expect(milestone.pctComplete).toEqual(ratio(99n, 100n));
        expect(milestone.evMh).toBe(hoursToMh(99));
    });
});
describe('computeEvm — Catch-all LOE reads baseline_wp.is_catch_all (story 5.12)', () => {
    it('uses LOE when the Baseline pin is Catch-all even if the live WP cache is false', () => {
        const baseline = {
            seq: 1,
            id: 'bl-1',
            reason: 'loe',
            recordedAt: '2026-06-01T00:00:00.000Z',
            actor: 'user:pm',
            wps: [
                {
                    wpId: 'WP-C',
                    start: '2026-06-01',
                    finish: '2026-06-12',
                    baselineMh: hoursToMh(100),
                    isMilestone: false,
                    isCatchAll: true,
                },
            ],
        };
        const r = computeEvm({
            asOf: '2026-06-05',
            calendar: cal,
            baseline,
            // Live cache false — must not win over the Baseline pin.
            wps: [wp({ id: 'WP-C', isCatchAll: false })],
            mappedTicketsByWp: new Map([['WP-C', [ticket('t1', 25, true)]]]),
            acByWp: new Map([['WP-C', hoursToMh(10)]]),
            unplannedAcMh: 0n,
            totalAcMh: hoursToMh(10),
            plannedScopeAcMh: hoursToMh(10),
            measurementBasis: 'hours',
        });
        const row = r.perWp[0];
        expect(row.pctBasis).toBe('loe');
        // as-of mid-span: PV = 50h of 100h → LOE pct = PV/BAC
        expect(row.pctComplete).toEqual(ratio(hoursToMh(50), hoursToMh(100)));
        expect(row.evMh).toBe(hoursToMh(50));
    });
    it('does not use LOE when the Baseline pin is false even if the live WP cache is Catch-all', () => {
        const baseline = {
            seq: 1,
            id: 'bl-1',
            reason: 'not-loe',
            recordedAt: '2026-06-01T00:00:00.000Z',
            actor: 'user:pm',
            wps: [
                {
                    wpId: 'WP-C',
                    start: '2026-06-01',
                    finish: '2026-06-12',
                    baselineMh: hoursToMh(100),
                    isMilestone: false,
                    isCatchAll: false,
                },
            ],
        };
        const r = computeEvm({
            asOf: '2026-06-05',
            calendar: cal,
            baseline,
            wps: [wp({ id: 'WP-C', isCatchAll: true })],
            mappedTicketsByWp: new Map([['WP-C', [ticket('t1', 25, true), ticket('t2', 25, false)]]]),
            acByWp: new Map([['WP-C', hoursToMh(10)]]),
            unplannedAcMh: 0n,
            totalAcMh: hoursToMh(10),
            plannedScopeAcMh: hoursToMh(10),
            measurementBasis: 'hours',
        });
        expect(r.perWp[0].pctBasis).not.toBe('loe');
    });
});
describe('isMarkedComplete (story 2.2: read off the head actual finish)', () => {
    it('is an actual finish on a WP that is not a milestone', () => {
        expect(isMarkedComplete(wp({ id: 'a', actualFinish: '2026-09-01' }))).toBe(true);
        expect(isMarkedComplete(wp({ id: 'b', actualStart: '2026-08-01' }))).toBe(false);
    });
    it('is never a milestone: its actual finish is "done", which lifts no cap', () => {
        expect(isMarkedComplete(wp({ id: 'm', isMilestone: true, actualFinish: '2026-09-01' }))).toBe(false);
    });
});
describe('computeEvm — golden case', () => {
    /**
     * Two baselined leaf WPs, both running 2026-06-01 .. 2026-06-12 (10 working days).
     * As-of Fri 2026-06-05 -> 5/10 elapsed.
     *
     *   WP-1: Baseline 100h, PV = 50h, 2 of 4 estimate-hours resolved
     *         estimates 25/25/25/25, two resolved -> 50h resolved of 100h -> 50%
     *         EV = 100h x 0.50 = 50h
     *   WP-2: Baseline 100h, PV = 50h, 1 of 4 resolved -> 25h/100h -> 25%
     *         EV = 100h x 0.25 = 25h
     *
     *   BAC = 200h, PV = 100h, EV = 75h
     *   Planned-scope AC = 90h, Unplanned = 30h, total AC = 120h
     *
     *   SV   = 75 - 100          = -25h
     *   SPI  = 75 / 100          =  0.75
     *   CV   = 75 - 120          = -45h
     *   CPI(all-in)  = 75 / 120  =  0.625
     *   CPI(planned) = 75 / 90   =  0.8333...
     *   EAC  = 200 / 0.625       =  320h
     *   ETC  = 320 - 120         =  200h
     *   VAC  = 200 - 320         = -120h
     *   TCPI = (200-75)/(200-120)= 125/80 = 1.5625
     */
    const baseline = {
        seq: 1,
        id: 'bl-1',
        reason: 'golden',
        recordedAt: '2026-06-01T00:00:00.000Z',
        actor: 'user:pm',
        wps: [
            { wpId: 'WP-1', start: '2026-06-01', finish: '2026-06-12', baselineMh: hoursToMh(100), isMilestone: false, isCatchAll: false },
            { wpId: 'WP-2', start: '2026-06-01', finish: '2026-06-12', baselineMh: hoursToMh(100), isMilestone: false, isCatchAll: false },
        ],
    };
    const wps = [wp({ id: 'WP-1' }), wp({ id: 'WP-2' })];
    const mapped = new Map([
        ['WP-1', [ticket('t1', 25, true), ticket('t2', 25, true), ticket('t3', 25, false), ticket('t4', 25, false)]],
        ['WP-2', [ticket('t5', 25, true), ticket('t6', 25, false), ticket('t7', 25, false), ticket('t8', 25, false)]],
    ]);
    const evm = computeEvm({
        asOf: '2026-06-05',
        calendar: cal,
        baseline,
        wps,
        mappedTicketsByWp: mapped,
        acByWp: new Map([
            ['WP-1', hoursToMh(50)],
            ['WP-2', hoursToMh(40)],
        ]),
        unplannedAcMh: hoursToMh(30),
        totalAcMh: hoursToMh(120),
        plannedScopeAcMh: hoursToMh(90),
        measurementBasis: 'hours',
    });
    it('computes BAC, PV, EV and AC in hours', () => {
        expect(evm.bacMh).toBe(hoursToMh(200));
        expect(evm.pvMh).toEqual(mhMetric(hoursToMh(100)));
        expect(evm.evMh).toEqual(mhMetric(hoursToMh(75)));
        expect(evm.acMh).toEqual(mhMetric(hoursToMh(120)));
    });
    it('computes the variances and indices from the summed values, never by averaging', () => {
        expect(evm.svMh).toEqual(mhMetric(hoursToMh(-25)));
        expect(evm.spi).toEqual(ratioMetric(hoursToMh(75), hoursToMh(100)));
        expect(evm.cvMh).toEqual(mhMetric(hoursToMh(-45)));
        expect(evm.cpiAllIn).toEqual(ratioMetric(hoursToMh(75), hoursToMh(120)));
        expect(evm.cpiPlannedScope).toEqual(ratioMetric(hoursToMh(75), hoursToMh(90)));
    });
    it('computes EAC Typical, ETC, VAC and TCPI', () => {
        expect(evm.eacMh).toEqual(mhMetric(hoursToMh(320)));
        expect(evm.etcMh).toEqual(mhMetric(hoursToMh(200)));
        expect(evm.vacMh).toEqual(mhMetric(hoursToMh(-120)));
        expect(evm.tcpi).toEqual(ratioMetric(hoursToMh(125), hoursToMh(80)));
    });
    it('drives the Health Indicators per FR-31', () => {
        const h = computeHealth({
            evm,
            thresholds: DEFAULT_THRESHOLDS,
            unplannedSharePeriod: ratio(1n, 4n),
            unplannedShareCumulative: ratio(1n, 4n),
            slippedMilestones: [],
            measurementBasis: 'hours',
        });
        expect(h.indicators.map((i) => [i.key, i.colour])).toEqual([
            ['schedule', 'red'], // SPI 0.75 < 0.85
            ['effort_cost', 'red'], // TCPI 1.5625 > 1.1
            ['unplanned', 'red'], // 25% > 20%
        ]);
        expect(h.overall).toBe('red');
    });
});
describe('FR-27 Ticket-Count Mode', () => {
    it('reports every AC-based metric as unavailable rather than zero', () => {
        const baseline = {
            seq: 1,
            id: 'bl-1',
            reason: 'x',
            recordedAt: '2026-06-01T00:00:00.000Z',
            actor: 'user:pm',
            wps: [
                { wpId: 'WP-1', start: '2026-06-01', finish: '2026-06-12', baselineMh: hoursToMh(100), isMilestone: false, isCatchAll: false },
            ],
        };
        const evm = computeEvm({
            asOf: '2026-06-05',
            calendar: cal,
            baseline,
            wps: [wp({ id: 'WP-1' })],
            mappedTicketsByWp: new Map([['WP-1', [ticket('t1', null, true), ticket('t2', null, false)]]]),
            acByWp: new Map(),
            unplannedAcMh: 0n,
            totalAcMh: 0n,
            plannedScopeAcMh: 0n,
            measurementBasis: 'count',
        });
        // Still computed on the count basis:
        expect(evm.pvMh).toEqual(mhMetric(hoursToMh(50)));
        expect(evm.evMh).toEqual(mhMetric(hoursToMh(50))); // 1 of 2 resolved
        expect(evm.spi).toEqual(ratioMetric(hoursToMh(50), hoursToMh(50)));
        // Unavailable, never 0:
        for (const m of [
            evm.acMh,
            evm.cpiAllIn,
            evm.cpiPlannedScope,
            evm.cvMh,
            evm.eacMh,
            evm.etcMh,
            evm.vacMh,
            evm.tcpi,
        ]) {
            expect(m.kind).toBe('unavailable');
            if (m.kind === 'unavailable')
                expect(m.reasonCode).toBe('tracker_provides_no_hours');
        }
    });
    it('labels mixed-Project AC coverage on hours Connectors only', () => {
        const baseline = {
            seq: 1,
            id: 'bl-1',
            reason: 'x',
            recordedAt: '2026-06-01T00:00:00.000Z',
            actor: 'user:pm',
            wps: [
                { wpId: 'WP-1', start: '2026-06-01', finish: '2026-06-12', baselineMh: hoursToMh(100), isMilestone: false, isCatchAll: false },
            ],
        };
        const caption = 'hours Connectors only (1 of 2)';
        const evm = computeEvm({
            asOf: '2026-06-05',
            calendar: cal,
            baseline,
            wps: [wp({ id: 'WP-1' })],
            mappedTicketsByWp: new Map([['WP-1', [ticket('t1', 50, true)]]]),
            acByWp: new Map([['WP-1', hoursToMh(40)]]),
            unplannedAcMh: 0n,
            totalAcMh: hoursToMh(40),
            plannedScopeAcMh: hoursToMh(40),
            measurementBasis: 'hours',
            acCoverage: caption,
        });
        expect(evm.acMh).toEqual({ kind: 'value', value: hoursToMh(40), unit: 'mh', coverage: caption });
        expect(evm.cpiAllIn.kind === 'value' && evm.cpiAllIn.coverage).toBe(caption);
    });
    it('marks Effort/Cost unavailable in Ticket-Count Mode and names it on overall', () => {
        const baseline = {
            seq: 1,
            id: 'bl-1',
            reason: 'x',
            recordedAt: '2026-06-01T00:00:00.000Z',
            actor: 'user:pm',
            wps: [
                { wpId: 'WP-1', start: '2026-06-01', finish: '2026-06-12', baselineMh: hoursToMh(100), isMilestone: false, isCatchAll: false },
            ],
        };
        const evm = computeEvm({
            asOf: '2026-06-05',
            calendar: cal,
            baseline,
            wps: [wp({ id: 'WP-1' })],
            mappedTicketsByWp: new Map([['WP-1', [ticket('t1', null, true), ticket('t2', null, false)]]]),
            acByWp: new Map(),
            unplannedAcMh: 0n,
            totalAcMh: 0n,
            plannedScopeAcMh: 0n,
            measurementBasis: 'count',
        });
        const h = computeHealth({
            evm,
            thresholds: DEFAULT_THRESHOLDS,
            unplannedSharePeriod: ratio(0n, 1n),
            unplannedShareCumulative: ratio(0n, 1n),
            slippedMilestones: [],
            measurementBasis: 'count',
        });
        expect(h.indicators.find((i) => i.key === 'effort_cost')?.colour).toBe('unavailable');
        expect(h.overallNote).toMatch(/Effort\/Cost/);
    });
});
describe('FR-31 threshold edges', () => {
    const base = {
        thresholds: DEFAULT_THRESHOLDS,
        slippedMilestones: [],
        measurementBasis: 'hours',
        unplannedShareCumulative: ratio(0n, 1n),
    };
    const r = (text) => ratio(hoursToMh(text), 1000n);
    // PV and EV are scaled so that EV ÷ PV is exactly the SPI passed (PV = 100 h × den,
    // EV = 100 h × num), keeping the fixture internally consistent without any rounding.
    const evmWith = (spi, cpi) => ({
        formulaVersion: 'test',
        perWp: [],
        bacMh: hoursToMh(100),
        pvMh: mhMetric(hoursToMh(100) * spi.den),
        evMh: mhMetric(hoursToMh(100) * spi.num),
        acMh: mhMetric(hoursToMh(10)),
        svMh: mhMetric(0n),
        spi: { kind: 'value', value: spi, unit: 'ratio', coverage: null },
        cvMh: mhMetric(0n),
        cpiAllIn: { kind: 'value', value: cpi, unit: 'ratio', coverage: null },
        cpiPlannedScope: { kind: 'value', value: cpi, unit: 'ratio', coverage: null },
        eacMh: mhMetric(0n),
        etcMh: mhMetric(0n),
        vacMh: mhMetric(0n),
        tcpi: { kind: 'value', value: ratio(1n, 1n), unit: 'ratio', coverage: null },
        bacExhausted: false,
    });
    it('treats 0.95 as green and 0.85 as amber', () => {
        expect(computeHealth({ ...base, evm: evmWith(r('0.95'), r('1.2')), unplannedSharePeriod: ratio(0n, 1n) })
            .indicators[0].colour).toBe('green');
        expect(computeHealth({ ...base, evm: evmWith(r('0.85'), r('1.2')), unplannedSharePeriod: ratio(0n, 1n) })
            .indicators[0].colour).toBe('amber');
        expect(computeHealth({ ...base, evm: evmWith(ratio(8499n, 10000n), r('1.2')), unplannedSharePeriod: ratio(0n, 1n) })
            .indicators[0].colour).toBe('red');
    });
    it('lands an SPI of exactly 95/100 on green, however it is written (exact comparison)', () => {
        // Float division puts 0.95 on either side of the boundary depending on the operands
        // (e.g. 2850/3000 vs 95/100); cross-multiplication cannot.
        for (const [num, den] of [
            [95n, 100n],
            [2850n, 3000n],
            [1900000n, 2000000n],
            [-95n, -100n],
        ]) {
            const h = computeHealth({ ...base, evm: evmWith(ratio(num, den), r('1.2')), unplannedSharePeriod: ratio(0n, 1n) });
            expect(h.indicators[0].colour, `${num}/${den}`).toBe('green');
            expect(h.indicators[0].rule).toBe('Green because SPI 0.95 ≥ 0.95');
        }
        // A hair below the boundary: exactly less than 95/100, but the nearest double to it IS
        // the double for 0.95, so a float comparison would call it green.
        const hair = ratio(95n * 10n ** 18n - 1n, 100n * 10n ** 18n);
        expect(computeHealth({ ...base, evm: evmWith(hair, r('1.2')), unplannedSharePeriod: ratio(0n, 1n) })
            .indicators[0].colour).toBe('amber');
        const below = computeHealth({
            ...base,
            evm: evmWith(ratio(949999n, 1000000n), r('1.2')),
            unplannedSharePeriod: ratio(0n, 1n),
        });
        expect(below.indicators[0].colour).toBe('amber');
        // Presented to 2 dp it reads 0.95, and the rule still says why it is amber.
        expect(below.indicators[0].rule).toBe('Amber because SPI 0.95 is between 0.85 and 0.95');
    });
    it('puts the Unplanned Work share bands at <10%, 10–20% inclusive, and >20%', () => {
        const colour = (s) => computeHealth({ ...base, evm: evmWith(r('1'), r('1')), unplannedSharePeriod: s }).indicators[2].colour;
        expect(colour(ratio(999n, 10000n))).toBe('green');
        expect(colour(ratio(1n, 10n))).toBe('amber');
        expect(colour(ratio(100n, 1000n))).toBe('amber');
        expect(colour(ratio(2n, 10n))).toBe('amber');
        expect(colour(ratio(2001n, 10000n))).toBe('red');
    });
    it('turns Effort/Cost red only when TCPI is strictly above 1.1', () => {
        const at = (tcpi) => computeHealth({
            ...base,
            evm: { ...evmWith(r('1'), r('1.2')), tcpi: { kind: 'value', value: tcpi, unit: 'ratio', coverage: null } },
            unplannedSharePeriod: ratio(0n, 1n),
        }).indicators[1];
        expect(at(ratio(110n, 100n)).colour).toBe('green');
        expect(at(ratio(1101n, 1000n)).colour).toBe('red');
        expect(at(ratio(1101n, 1000n)).rule).toBe('Red because TCPI 1.10 > 1.1 — the remaining work must beat the planned efficiency; CPI 1.20 shown beside TCPI');
    });
    it('is never green overall while Schedule is red, even with CPI > 1', () => {
        const h = computeHealth({ ...base, evm: evmWith(r('0.5'), r('1.4')), unplannedSharePeriod: ratio(0n, 1n) });
        expect(h.overall).toBe('red');
    });
    it('makes Schedule at least amber when a milestone has slipped, whatever the SPI', () => {
        const h = computeHealth({
            ...base,
            evm: evmWith(r('1.0'), r('1.2')),
            unplannedSharePeriod: ratio(0n, 1n),
            slippedMilestones: [{ wbsCode: '8.M3', name: 'Checkout', baselineDate: '2026-09-08' }],
        });
        expect(h.indicators[0].colour).toBe('amber');
    });
});
