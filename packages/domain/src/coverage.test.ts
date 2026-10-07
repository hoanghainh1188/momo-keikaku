import { describe, expect, it } from 'vitest';
import { addDays, periodOf } from './calendar';
import {
  computeCoverage,
  projectAgeDays,
  SM5_MIN_AGE_DAYS,
  SM5_TARGET,
  type CoverageInput,
} from './coverage';
import { mappingHead } from './mapping';
import { DEFAULT_THRESHOLDS, type WorkPackage } from './types';
import { hoursToMh } from './units';

const buildWp = (id: string, isCatchAll = false): WorkPackage => ({
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

function baseInput(overrides: Partial<CoverageInput> = {}): CoverageInput {
  const tickets = [
    ticket('t-mapped', 'KEY-M'),
    ticket('t-ca', 'KEY-CA'),
    ticket('t-unmapped', 'KEY-U'),
  ];
  const mappingEvents = [
    { seq: 1, ticketId: 't-mapped', wpId: 'WP-M', source: 'manual' as const, at: 'x', actor: 'pm' },
    { seq: 2, ticketId: 't-ca', wpId: 'WP-CA', source: 'manual' as const, at: 'x', actor: 'pm' },
  ];
  const head = mappingHead(mappingEvents);
  const project = {
    id: 'p',
    name: 'p',
    clientName: 'c',
    contractType: '準委任' as const,
    tzOffsetMinutes: 540,
    teireiWeekday: 4,
    defaultRateYenPerHour: 4000n,
    eacMethod: 'typical' as const,
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
            isMilestone: false,
          },
          {
            wpId: 'WP-CA',
            start: '2026-06-01',
            finish: '2026-12-01',
            baselineMh: hoursToMh(20),
            isMilestone: false,
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

function ticket(id: string, key: string) {
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

function entry(seq: number, ticketId: string, hours: number, kind: 'delta' | 'opening_balance' = 'delta') {
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

function add14(start: string): string {
  return addDays(start, 14);
}

describe('computeCoverage', () => {
  it('reports three Ticket buckets with Catch-all excluded from mapped (hours Connector)', () => {
    const r = computeCoverage(baseInput());
    const c = r.connectors[0]!;
    expect(c.ticketShare.counts).toEqual({ mapped: 1, catchAll: 1, unmapped: 1, total: 3 });
    expect(c.ticketShare.mapped).toEqual({ num: 1n, den: 3n });
    expect(c.ticketShare.catchAll).toEqual({ num: 1n, den: 3n });
    expect(c.ticketShare.unmapped).toEqual({ num: 1n, den: 3n });
    expect(c.hourShare.kind).toBe('value');
    if (c.hourShare.kind !== 'value') throw new Error('expected value');
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
    const r = computeCoverage(
      baseInput({
        connectors: [{ id: 'con-a', label: 'Space A', measurementBasis: 'count' }],
      }),
    );
    expect(r.connectors[0]!.hourShare).toEqual({
      kind: 'unavailable',
      reasonCode: 'tracker_provides_no_hours',
    });
    expect(r.connectors[0]!.ticketShare.counts.total).toBe(3);
    expect(r.projectTotal.hourShare.kind).toBe('unavailable');
  });

  it('returns ZERO / empty shares for an empty Connector', () => {
    const r = computeCoverage(
      baseInput({
        tickets: [],
        ledger: [],
        ownerConnectorByTicket: new Map(),
      }),
    );
    const c = r.connectors[0]!;
    expect(c.ticketShare.counts.total).toBe(0);
    expect(c.ticketShare.mapped).toEqual({ num: 0n, den: 1n });
    if (c.hourShare.kind !== 'value') throw new Error('expected value');
    expect(c.hourShare.totalMh).toBe(0n);
  });

  it('keeps Opening Balances out of hour shares', () => {
    const r = computeCoverage(
      baseInput({
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
      }),
    );
    const c = r.connectors[0]!;
    if (c.hourShare.kind !== 'value') throw new Error('expected value');
    expect(c.hourShare.totalMh).toBe(hoursToMh(20));
  });

  it('keeps left-scope Tickets out of Ticket shares', () => {
    const r = computeCoverage(
      baseInput({
        leftScopeTicketIds: new Set(['t-unmapped']),
      }),
    );
    expect(r.connectors[0]!.ticketShare.counts).toEqual({
      mapped: 1,
      catchAll: 1,
      unmapped: 0,
      total: 2,
    });
  });

  it('marks SM-5 unavailable before day 14 and reports mapped-excluding-Catch-all after', () => {
    const young = computeCoverage(
      baseInput({ projectStart: '2026-09-10', asOf: '2026-09-16' }),
    );
    expect(young.sm5).toEqual({ kind: 'unavailable', reasonCode: 'project_younger_than_14_days' });

    const ready = computeCoverage(
      baseInput({ projectStart: '2026-01-01', asOf: '2026-09-16' }),
    );
    expect(ready.sm5.kind).toBe('value');
    if (ready.sm5.kind !== 'value') throw new Error('expected value');
    expect(ready.sm5.value).toEqual({ num: hoursToMh(40), den: hoursToMh(100) });
    expect(SM5_TARGET).toEqual({ num: 80n, den: 100n });
  });

  it('rolls up Project total with hours from hours Connectors only', () => {
    const r = computeCoverage(
      baseInput({
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
      }),
    );
    expect(r.connectors[1]!.hourShare.kind).toBe('unavailable');
    expect(r.projectTotal.ticketShare.counts.total).toBe(4);
    expect(r.projectTotal.hourShare.kind).toBe('value');
    if (r.projectTotal.hourShare.kind !== 'value') throw new Error('expected value');
    expect(r.projectTotal.hourShare.totalMh).toBe(hoursToMh(100));
  });
});
