import { describe, expect, it } from 'vitest';
import { computeEvm } from './evm';
import { drillDownRowsForMetric, interpretationKeyForMetric, periodDeltaRational, priorAsOfForPeriod, } from './metric-formula';
import { hoursToMh, ratio, unavailable } from './units';
const cal = { id: 'demo', holidays: {} };
describe('metric-formula (story 6.3)', () => {
    it('priorAsOfForPeriod is the day before period start', () => {
        expect(priorAsOfForPeriod('2026-06-10')).toBe('2026-06-09');
    });
    it('interpretationKeyForMetric flags BAC exhausted TCPI', () => {
        const evm = {
            bacExhausted: true,
            tcpi: unavailable('bac_exhausted'),
            cvMh: { kind: 'value', value: 0n, unit: 'mh', coverage: null },
            svMh: { kind: 'value', value: 0n, unit: 'mh', coverage: null },
            cpiAllIn: { kind: 'value', value: ratio(1n, 1n), unit: 'ratio', coverage: null },
            cpiPlannedScope: { kind: 'value', value: ratio(1n, 1n), unit: 'ratio', coverage: null },
            spi: { kind: 'value', value: ratio(1n, 1n), unit: 'ratio', coverage: null },
        };
        expect(interpretationKeyForMetric('tcpi', evm)).toBe('bac_exhausted');
    });
    it('periodDeltaRational computes mh delta for SV', () => {
        const base = {
            calendar: cal,
            baseline: {
                seq: 1,
                id: 'b',
                reason: '',
                recordedAt: '',
                actor: '',
                wps: [
                    {
                        wpId: 'wp1',
                        start: '2026-06-01',
                        finish: '2026-06-10',
                        baselineMh: hoursToMh(100),
                        isMilestone: false,
                        isCatchAll: false,
                    },
                ],
            },
            wps: [
                {
                    id: 'wp1',
                    parentId: null,
                    wbsCode: '1',
                    name: 'Leaf',
                    isLeaf: true,
                    isMilestone: false,
                    isCatchAll: false,
                    plannedMh: 0n,
                    assignedResourceIds: [],
                    actualStart: null,
                    actualFinish: null,
                },
            ],
            mappedTicketsByWp: new Map(),
            acByWp: new Map([['wp1', hoursToMh(10)]]),
            unplannedAcMh: 0n,
            totalAcMh: hoursToMh(10),
            plannedScopeAcMh: hoursToMh(10),
            measurementBasis: 'hours',
        };
        const current = computeEvm({ ...base, asOf: '2026-06-05' });
        const prior = computeEvm({ ...base, asOf: '2026-06-01' });
        const delta = periodDeltaRational('sv', current, prior);
        expect(delta.kind).toBe('mh');
        if (delta.kind === 'mh')
            expect(delta.delta).toBe(current.svMh.kind === 'value' && prior.svMh.kind === 'value' ? current.svMh.value - prior.svMh.value : -1n);
    });
    it('drillDownRowsForMetric attaches ticket keys only for AC-derived metrics', () => {
        const evm = {
            perWp: [
                {
                    wpId: 'wp1',
                    wbsCode: '1',
                    name: 'A',
                    baselineMh: hoursToMh(10),
                    pvMh: hoursToMh(5),
                    evMh: hoursToMh(4),
                    acMh: hoursToMh(6),
                    pctComplete: ratio(4n, 10n),
                    pctBasis: 'count',
                    lowEvidence: false,
                    mappedTickets: 1,
                    resolvedTickets: 0,
                    evFell: false,
                },
            ],
        };
        const tickets = new Map([['wp1', ['TK-1']]]);
        expect(drillDownRowsForMetric('ac', evm, tickets)[0]?.ticketKeys).toEqual(['TK-1']);
        expect(drillDownRowsForMetric('ev', evm, tickets)[0]?.ticketKeys).toEqual([]);
    });
});
