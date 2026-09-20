import { describe, expect, it } from 'vitest';
import { buildCalendar } from './calendar';
import { computeEvm, percentComplete, plannedValue } from './evm';
import { computeHealth } from './health';
import { DEFAULT_THRESHOLDS, type BaselineVersion, type TicketObservation, type WorkPackage } from './types';
import { hoursToMh } from './units';

/**
 * Golden EVM cases, hand-computed from the PMI formulas in docs/references
 * (FR-30) so the numbers can be checked without running the code.
 */

const cal = buildCalendar('test', { jp: false, vn: false }); // weekends only

const wp = (over: Partial<WorkPackage> & { id: string }): WorkPackage => ({
  wbsCode: over.id,
  name: over.id,
  parentId: null,
  isLeaf: true,
  isMilestone: false,
  isCatchAll: false,
  start: null,
  finish: null,
  plannedMh: 0,
  completedAt: null,
  milestoneDoneAt: null,
  assignedResourceIds: [],
  ...over,
});

const ticket = (id: string, estimateHours: number | null, resolved: boolean): TicketObservation => ({
  trackerIssueId: id,
  key: id,
  title: id,
  statusId: resolved ? 'Closed' : 'Open',
  resolved,
  estimateMh: estimateHours === null ? null : hoursToMh(estimateHours),
  actualMh: 0,
  assigneeAccountId: null,
  issueTypeId: 'Task',
  categoryIds: [],
  milestoneIds: [],
  createdAt: '2026-06-01T00:00:00.000Z',
});

describe('plannedValue (FR-30: PV spread linearly over baseline working days)', () => {
  it('is 0 before the WP starts and the full Baseline after it finishes', () => {
    // 2026-06-01 Mon .. 2026-06-12 Fri = 10 working days
    expect(plannedValue(hoursToMh(100), '2026-06-01', '2026-06-12', '2026-05-29', cal)).toBe(0);
    expect(plannedValue(hoursToMh(100), '2026-06-01', '2026-06-12', '2026-06-30', cal)).toBe(
      hoursToMh(100),
    );
  });

  it('spreads over working days only, skipping the weekend', () => {
    // as-of Fri 2026-06-05 = 5 of 10 working days elapsed -> 50h of 100h
    expect(plannedValue(hoursToMh(100), '2026-06-01', '2026-06-12', '2026-06-05', cal)).toBe(
      hoursToMh(50),
    );
    // as-of Sun 2026-06-07 is still 5 working days elapsed -> unchanged
    expect(plannedValue(hoursToMh(100), '2026-06-01', '2026-06-12', '2026-06-07', cal)).toBe(
      hoursToMh(50),
    );
  });
});

describe('percentComplete (FR-30: never derived from burned effort)', () => {
  it('uses the estimate basis when every mapped Ticket has an estimate', () => {
    // resolved estimate 30h; total estimate 100h; baseline 80h -> denominator 100h
    const tickets = [ticket('a', 30, true), ticket('b', 40, false), ticket('c', 30, false)];
    const r = percentComplete(tickets, hoursToMh(80), false);
    expect(r.basis).toBe('estimate');
    expect(r.pct).toBeCloseTo(0.3, 10);
  });

  it('uses the larger of Baseline hours and total estimate as the denominator', () => {
    // resolved 30h, total estimate 40h, baseline 80h -> 30/80
    const tickets = [ticket('a', 30, true), ticket('b', 10, false), ticket('c', 0.001, false)];
    const r = percentComplete(tickets, hoursToMh(80), false);
    expect(r.pct).toBeCloseTo(30 / 80.001, 4);
  });

  it('falls back to the count basis when any mapped Ticket has no estimate', () => {
    const tickets = [ticket('a', 10, true), ticket('b', null, true), ticket('c', 10, false)];
    const r = percentComplete(tickets, hoursToMh(80), false);
    expect(r.basis).toBe('count');
    expect(r.pct).toBeCloseTo(2 / 3, 10);
  });

  it('caps at 99% until the PM marks the WP complete, and flags low evidence', () => {
    const tickets = [ticket('a', 10, true), ticket('b', 10, true)];
    const open = percentComplete(tickets, hoursToMh(20), false);
    expect(open.pct).toBe(0.99);
    expect(open.lowEvidence).toBe(true); // fewer than three mapped Tickets
    const done = percentComplete(tickets, hoursToMh(20), true);
    expect(done.pct).toBe(1);
  });

  it('reports no evidence when nothing is mapped', () => {
    const r = percentComplete([], hoursToMh(20), false);
    expect(r).toEqual({ pct: 0, basis: 'no-evidence', lowEvidence: true });
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
  const baseline: BaselineVersion = {
    seq: 1,
    id: 'bl-1',
    reason: 'golden',
    recordedAt: '2026-06-01T00:00:00.000Z',
    wps: [
      { wpId: 'WP-1', start: '2026-06-01', finish: '2026-06-12', baselineMh: hoursToMh(100), isMilestone: false },
      { wpId: 'WP-2', start: '2026-06-01', finish: '2026-06-12', baselineMh: hoursToMh(100), isMilestone: false },
    ],
  };
  const wps = [wp({ id: 'WP-1' }), wp({ id: 'WP-2' })];
  const mapped = new Map<string, TicketObservation[]>([
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
    expect(evm.pvMh).toBe(hoursToMh(100));
    expect(evm.evMh).toBe(hoursToMh(75));
    expect(evm.acMh).toBe(hoursToMh(120));
  });

  it('computes the variances and indices from the summed values, never by averaging', () => {
    expect(evm.svMh).toBe(hoursToMh(-25));
    expect(evm.spi).toEqual({ kind: 'value', value: 0.75, unit: 'ratio' });
    expect(evm.cvMh).toEqual({ kind: 'value', value: hoursToMh(-45), unit: 'mh' });
    expect(evm.cpiAllIn.kind === 'value' && evm.cpiAllIn.value).toBeCloseTo(0.625, 10);
    expect(evm.cpiPlannedScope.kind === 'value' && evm.cpiPlannedScope.value).toBeCloseTo(
      0.8333333333,
      8,
    );
  });

  it('computes EAC Typical, ETC, VAC and TCPI', () => {
    expect(evm.eacMh).toEqual({ kind: 'value', value: hoursToMh(320), unit: 'mh' });
    expect(evm.etcMh).toEqual({ kind: 'value', value: hoursToMh(200), unit: 'mh' });
    expect(evm.vacMh).toEqual({ kind: 'value', value: hoursToMh(-120), unit: 'mh' });
    expect(evm.tcpi.kind === 'value' && evm.tcpi.value).toBeCloseTo(1.5625, 10);
  });

  it('drives the Health Indicators per FR-31', () => {
    const h = computeHealth({
      evm,
      thresholds: DEFAULT_THRESHOLDS,
      unplannedSharePeriod: 0.25,
      unplannedShareCumulative: 0.25,
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
    const baseline: BaselineVersion = {
      seq: 1,
      id: 'bl-1',
      reason: 'x',
      recordedAt: '2026-06-01T00:00:00.000Z',
      wps: [
        { wpId: 'WP-1', start: '2026-06-01', finish: '2026-06-12', baselineMh: hoursToMh(100), isMilestone: false },
      ],
    };
    const evm = computeEvm({
      asOf: '2026-06-05',
      calendar: cal,
      baseline,
      wps: [wp({ id: 'WP-1' })],
      mappedTicketsByWp: new Map([['WP-1', [ticket('t1', null, true), ticket('t2', null, false)]]]),
      acByWp: new Map(),
      unplannedAcMh: 0,
      totalAcMh: 0,
      plannedScopeAcMh: 0,
      measurementBasis: 'count',
    });
    // Still computed on the count basis:
    expect(evm.pvMh).toBe(hoursToMh(50));
    expect(evm.evMh).toBe(hoursToMh(50)); // 1 of 2 resolved
    expect(evm.spi).toEqual({ kind: 'value', value: 1, unit: 'ratio' });
    // Unavailable, never 0:
    for (const m of [evm.cpiAllIn, evm.cvMh, evm.eacMh, evm.etcMh, evm.vacMh, evm.tcpi]) {
      expect(m.kind).toBe('unavailable');
    }
  });
});

describe('FR-31 threshold edges', () => {
  const base = {
    thresholds: DEFAULT_THRESHOLDS,
    slippedMilestones: [],
    measurementBasis: 'hours' as const,
    unplannedShareCumulative: 0,
  };
  const evmWith = (spi: number, cpi: number) =>
    ({
      formulaVersion: 'test',
      perWp: [],
      bacMh: hoursToMh(100),
      pvMh: hoursToMh(100),
      evMh: hoursToMh(100 * spi),
      acMh: hoursToMh(10),
      svMh: 0,
      spi: { kind: 'value', value: spi, unit: 'ratio' },
      cvMh: { kind: 'value', value: 0, unit: 'mh' },
      cpiAllIn: { kind: 'value', value: cpi, unit: 'ratio' },
      cpiPlannedScope: { kind: 'value', value: cpi, unit: 'ratio' },
      eacMh: { kind: 'value', value: 0, unit: 'mh' },
      etcMh: { kind: 'value', value: 0, unit: 'mh' },
      vacMh: { kind: 'value', value: 0, unit: 'mh' },
      tcpi: { kind: 'value', value: 1.0, unit: 'ratio' },
      bacExhausted: false,
    }) as Parameters<typeof computeHealth>[0]['evm'];

  it('treats 0.95 as green and 0.85 as amber', () => {
    expect(
      computeHealth({ ...base, evm: evmWith(0.95, 1.2), unplannedSharePeriod: 0 }).indicators[0]!
        .colour,
    ).toBe('green');
    expect(
      computeHealth({ ...base, evm: evmWith(0.85, 1.2), unplannedSharePeriod: 0 }).indicators[0]!
        .colour,
    ).toBe('amber');
    expect(
      computeHealth({ ...base, evm: evmWith(0.8499, 1.2), unplannedSharePeriod: 0 }).indicators[0]!
        .colour,
    ).toBe('red');
  });

  it('puts the Unplanned Work share bands at <10%, 10–20% inclusive, and >20%', () => {
    const colour = (s: number) =>
      computeHealth({ ...base, evm: evmWith(1, 1), unplannedSharePeriod: s }).indicators[2]!.colour;
    expect(colour(0.0999)).toBe('green');
    expect(colour(0.1)).toBe('amber');
    expect(colour(0.2)).toBe('amber');
    expect(colour(0.2001)).toBe('red');
  });

  it('is never green overall while Schedule is red, even with CPI > 1', () => {
    const h = computeHealth({ ...base, evm: evmWith(0.5, 1.4), unplannedSharePeriod: 0 });
    expect(h.overall).toBe('red');
  });

  it('makes Schedule at least amber when a milestone has slipped, whatever the SPI', () => {
    const h = computeHealth({
      ...base,
      evm: evmWith(1.0, 1.2),
      unplannedSharePeriod: 0,
      slippedMilestones: [{ wbsCode: '8.M3', name: 'Checkout', baselineDate: '2026-09-08' }],
    });
    expect(h.indicators[0]!.colour).toBe('amber');
  });
});
