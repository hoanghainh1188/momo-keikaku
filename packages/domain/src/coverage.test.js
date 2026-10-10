import { describe, expect, it } from 'vitest';
import { addDays, periodOf } from './calendar';
import { computeCoverage, hourBucketForTicket, projectAgeDays, SM5_MIN_AGE_DAYS, SM5_TARGET, ticketShareBucketFor, } from './coverage';
import { mappingHead } from './mapping';
import { DEFAULT_THRESHOLDS } from './types';
import { hoursToMh } from './units';
const buildWp = (id, isCatchAll = false) => ({
    id,
    wbsCode: id,
    name: id,
    parentId: null,
    isLeaf: true,
    isMilestone: false,
    isCatchAll,
    plannedMh: hoursToMh(100),
    actualStart: null,
    actualFinish: null,
    assignedResourceIds: [],
});
const wpMapped = buildWp('WP-M');
const wpCatchAll = buildWp('WP-CA', true);
const wpNonBl = buildWp('WP-NB');
function baseInput(overrides = {}) {
    const tickets = [
        ticket('t-mapped', 'KEY-M'),
        ticket('t-ca', 'KEY-CA'),
        ticket('t-unmapped', 'KEY-U'),
    ];
    const mappingEvents = [
        { seq: 1, ticketId: 't-mapped', wpId: 'WP-M', source: 'manual', at: 'x', actor: 'pm' },
        { seq: 2, ticketId: 't-ca', wpId: 'WP-CA', source: 'manual', at: 'x', actor: 'pm' },
    ];
    const head = mappingHead(mappingEvents);
    const project = {
        id: 'p',
        name: 'p',
        clientName: 'c',
        contractType: '準委任',
        tzOffsetMinutes: 540,
        teireiWeekday: 4,
        defaultRateYenPerHour: 4000n,
        eacMethod: 'typical',
        thresholds: DEFAULT_THRESHOLDS,
    };
    return {
        tickets,
        head,
        wps: [wpMapped, wpCatchAll, wpNonBl],
        ledger: [
            entry(1, 't-mapped', 40),
            entry(2, 't-ca', 30),
            entry(3, 't-unmapped', 30),
        ],
        baselineVersions: [
            {
                seq: 1,
                id: 'bl-1',
                reason: 'x',
                recordedAt: '2026-06-01T00:00:00.000Z',
                actor: 'user:pm',
                wps: [
                    {
                        wpId: 'WP-M',
                        start: '2026-06-01',
                        finish: '2026-12-01',
                        baselineMh: hoursToMh(100),
                        isMilestone: false, isCatchAll: false,
                    },
                    {
                        wpId: 'WP-CA',
                        start: '2026-06-01',
                        finish: '2026-12-01',
                        baselineMh: hoursToMh(20),
                        isMilestone: false, isCatchAll: true,
                    },
                ],
            },
        ],
        resources: [],
        project,
        period: periodOf('2026-09-16T09:00:00.000Z', 540, 4),
        connectors: [{ id: 'con-a', label: 'Space A', measurementBasis: 'hours' }],
        ownerConnectorByTicket: new Map([
            ['t-mapped', 'con-a'],
            ['t-ca', 'con-a'],
            ['t-unmapped', 'con-a'],
        ]),
        projectStart: '2026-01-01',
        asOf: '2026-09-16',
        ...overrides,
    };
}
function ticket(id, key) {
    return {
        trackerIssueId: id,
        key,
        title: key,
        statusId: 'Open',
        estimateMh: null,
        actualMh: null,
        assigneeAccountId: null,
        createdAt: '2026-06-01T00:00:00.000Z',
        parentIssueId: null,
        issueTypeId: 'Task',
        trackerProjectId: null,
        attributes: [],
    };
}
function entry(seq, ticketId, hours, kind = 'delta') {
    return {
        seq,
        ticketId,
        kind,
        deltaMh: hoursToMh(hours),
        windowStart: null,
        windowEnd: '2026-09-15T09:00:00.000Z',
        assigneeAccountId: null,
        activeBaselineVersionSeq: 1,
    };
}
describe('projectAgeDays', () => {
    it('is 0 on the start date and 14 on start+14', () => {
        expect(projectAgeDays('2026-01-01', '2026-01-01')).toBe(0);
        expect(projectAgeDays('2026-01-01', '2026-01-15')).toBe(14);
        expect(projectAgeDays('2026-01-01', add14('2026-01-01'))).toBe(SM5_MIN_AGE_DAYS);
    });
});
describe('ticketBucket vs hourBucketForTicket', () => {
    it('treats a Mapping to a missing WP as Unmapped on both paths', () => {
        const head = mappingHead([
            { seq: 1, ticketId: 't1', wpId: 'WP-GONE', source: 'manual', at: 'x', actor: 'pm' },
        ]);
        expect(ticketShareBucketFor('t1', head, [])).toBe('unmapped');
        expect(hourBucketForTicket('t1', head, new Map(), new Set())).toBe('unmapped');
    });
    it('uses flag-at-seq: live Catch-all true + flag cleared at pin → mapped, not catch-all', () => {
        const head = mappingHead([
            { seq: 1, ticketId: 't-ca', wpId: 'WP-CA', source: 'manual', at: 'x', actor: 'pm' },
        ]);
        const flags = [
            { seq: 1, wpId: 'WP-CA', isCatchAll: true, actor: 'pm', at: 'x' },
            { seq: 2, wpId: 'WP-CA', isCatchAll: false, actor: 'pm', at: 'y' },
        ];
        // Live WP cache still true.
        expect(ticketShareBucketFor('t-ca', head, [wpCatchAll], flags, 2)).toBe('mapped');
        expect(hourBucketForTicket('t-ca', head, new Map([['WP-CA', wpCatchAll]]), new Set(['WP-CA']), flags, 2)).toBe('mapped-baselined');
    });
    it('keeps segment labels as stable keys for the UI to translate', () => {
        const r = computeCoverage(baseInput());
        const hour = r.connectors[0].hourShare;
        if (hour.kind !== 'value')
            throw new Error('expected value');
        expect(hour.segments.every((s) => s.label === s.key)).toBe(true);
        expect(r.connectors[0].ticketShare.segments.every((s) => s.label === s.key)).toBe(true);
    });
});
function add14(start) {
    return addDays(start, 14);
}
describe('computeCoverage', () => {
    it('reports three Ticket buckets with Catch-all excluded from mapped (hours Connector)', () => {
        const r = computeCoverage(baseInput());
        const c = r.connectors[0];
        expect(c.ticketShare.counts).toEqual({ mapped: 1, catchAll: 1, unmapped: 1, total: 3 });
        expect(c.ticketShare.mapped).toEqual({ num: 1n, den: 3n });
        expect(c.ticketShare.catchAll).toEqual({ num: 1n, den: 3n });
        expect(c.ticketShare.unmapped).toEqual({ num: 1n, den: 3n });
        expect(c.hourShare.kind).toBe('value');
        if (c.hourShare.kind !== 'value')
            throw new Error('expected value');
        // 40h mapped + 20h catch-all within + 10h overflow + 30h unmapped = 100h
        expect(c.hourShare.totalMh).toBe(hoursToMh(100));
        expect(c.hourShare.mappedExcludingCatchAll).toEqual({ num: hoursToMh(40), den: hoursToMh(100) });
        expect(c.hourShare.segments.map((s) => s.key)).toEqual([
            'mapped-baselined',
            'mapped-non-baselined',
            'catch-all',
            'catch-all-overflow',
            'unmapped',
        ]);
        expect(r.projectTotal.ticketShare.counts.total).toBe(3);
    });
    it('returns hour share unavailable for Ticket-Count Mode, never as a zero ratio', () => {
        const r = computeCoverage(baseInput({
            connectors: [{ id: 'con-a', label: 'Space A', measurementBasis: 'count' }],
        }));
        expect(r.connectors[0].hourShare).toEqual({
            kind: 'unavailable',
            reasonCode: 'tracker_provides_no_hours',
        });
        expect(r.connectors[0].ticketShare.counts.total).toBe(3);
        expect(r.projectTotal.hourShare.kind).toBe('unavailable');
    });
    it('returns ZERO / empty shares for an empty Connector', () => {
        const r = computeCoverage(baseInput({
            tickets: [],
            ledger: [],
            ownerConnectorByTicket: new Map(),
        }));
        const c = r.connectors[0];
        expect(c.ticketShare.counts.total).toBe(0);
        expect(c.ticketShare.mapped).toEqual({ num: 0n, den: 1n });
        if (c.hourShare.kind !== 'value')
            throw new Error('expected value');
        expect(c.hourShare.totalMh).toBe(0n);
    });
    it('keeps Opening Balances out of hour shares', () => {
        const r = computeCoverage(baseInput({
            ledger: [
                entry(1, 't-mapped', 40, 'opening_balance'),
                entry(2, 't-mapped', 10),
                entry(3, 't-unmapped', 10),
            ],
            tickets: [ticket('t-mapped', 'KEY-M'), ticket('t-unmapped', 'KEY-U')],
            ownerConnectorByTicket: new Map([
                ['t-mapped', 'con-a'],
                ['t-unmapped', 'con-a'],
            ]),
        }));
        const c = r.connectors[0];
        if (c.hourShare.kind !== 'value')
            throw new Error('expected value');
        expect(c.hourShare.totalMh).toBe(hoursToMh(20));
    });
    it('keeps left-scope Tickets out of Ticket shares', () => {
        const r = computeCoverage(baseInput({
            leftScopeTicketIds: new Set(['t-unmapped']),
        }));
        expect(r.connectors[0].ticketShare.counts).toEqual({
            mapped: 1,
            catchAll: 1,
            unmapped: 0,
            total: 2,
        });
    });
    it('marks SM-5 unavailable before day 14 and reports mapped-excluding-Catch-all after', () => {
        const young = computeCoverage(baseInput({ projectStart: '2026-09-10', asOf: '2026-09-16' }));
        expect(young.sm5).toEqual({ kind: 'unavailable', reasonCode: 'project_younger_than_14_days' });
        const ready = computeCoverage(baseInput({ projectStart: '2026-01-01', asOf: '2026-09-16' }));
        expect(ready.sm5.kind).toBe('value');
        if (ready.sm5.kind !== 'value')
            throw new Error('expected value');
        expect(ready.sm5.value).toEqual({ num: hoursToMh(40), den: hoursToMh(100) });
        expect(SM5_TARGET).toEqual({ num: 80n, den: 100n });
    });
    it('rolls up Project total with hours from hours Connectors only', () => {
        const r = computeCoverage(baseInput({
            connectors: [
                { id: 'con-h', label: 'Hours', measurementBasis: 'hours' },
                { id: 'con-c', label: 'Count', measurementBasis: 'count' },
            ],
            tickets: [
                ticket('t-mapped', 'KEY-M'),
                ticket('t-ca', 'KEY-CA'),
                ticket('t-unmapped', 'KEY-U'),
                ticket('t-count', 'KEY-CT'),
            ],
            ownerConnectorByTicket: new Map([
                ['t-mapped', 'con-h'],
                ['t-ca', 'con-h'],
                ['t-unmapped', 'con-h'],
                ['t-count', 'con-c'],
            ]),
            ledger: [
                entry(1, 't-mapped', 40),
                entry(2, 't-ca', 30),
                entry(3, 't-unmapped', 30),
            ],
        }));
        expect(r.connectors[1].hourShare.kind).toBe('unavailable');
        expect(r.projectTotal.ticketShare.counts.total).toBe(4);
        expect(r.projectTotal.hourShare.kind).toBe('value');
        if (r.projectTotal.hourShare.kind !== 'value')
            throw new Error('expected value');
        expect(r.projectTotal.hourShare.totalMh).toBe(hoursToMh(100));
    });
    it('applies Catch-all LOE once project-wide (does not stack Baseline caps per Connector)', () => {
        // Two hours Connectors each book 15h on the same Catch-all WP (Baseline 20h).
        // Per-Connector attribute would grant each a full 20h cap → 30h within / 0 overflow.
        // Project-wide LOE: 20h within + 10h overflow; connector slices sum to that.
        const r = computeCoverage(baseInput({
            connectors: [
                { id: 'con-a', label: 'A', measurementBasis: 'hours' },
                { id: 'con-b', label: 'B', measurementBasis: 'hours' },
            ],
            tickets: [ticket('t-a', 'KEY-A'), ticket('t-b', 'KEY-B')],
            ownerConnectorByTicket: new Map([
                ['t-a', 'con-a'],
                ['t-b', 'con-b'],
            ]),
            ledger: [
                entry(1, 't-a', 15),
                entry(2, 't-b', 15),
            ],
            head: mappingHead([
                { seq: 1, ticketId: 't-a', wpId: 'WP-CA', source: 'manual', at: 'x', actor: 'pm' },
                { seq: 2, ticketId: 't-b', wpId: 'WP-CA', source: 'manual', at: 'x', actor: 'pm' },
            ]),
        }));
        const total = r.projectTotal.hourShare;
        expect(total.kind).toBe('value');
        if (total.kind !== 'value')
            throw new Error('expected value');
        const byKey = Object.fromEntries(total.segments.map((s) => [s.key, s.mh]));
        expect(byKey['catch-all']).toBe(hoursToMh(20));
        expect(byKey['catch-all-overflow']).toBe(hoursToMh(10));
        expect(total.totalMh).toBe(hoursToMh(30));
        const a = r.connectors[0].hourShare;
        const b = r.connectors[1].hourShare;
        expect(a.kind).toBe('value');
        expect(b.kind).toBe('value');
        if (a.kind !== 'value' || b.kind !== 'value')
            throw new Error('expected value');
        const aSeg = Object.fromEntries(a.segments.map((s) => [s.key, s.mh]));
        const bSeg = Object.fromEntries(b.segments.map((s) => [s.key, s.mh]));
        expect(aSeg['catch-all'] + bSeg['catch-all']).toBe(hoursToMh(20));
        expect(aSeg['catch-all-overflow'] + bSeg['catch-all-overflow']).toBe(hoursToMh(10));
        // Epic-5-retro F5: overflow map is the same pass as the bar segments.
        const overflowTotal = [...r.overflowMhByTicket.values()].reduce((a, b) => a + b, 0n);
        expect(overflowTotal).toBe(hoursToMh(10));
        expect(byKey['catch-all-overflow']).toBe(overflowTotal);
    });
});
