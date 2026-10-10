import { describe, expect, it } from 'vitest';
import { periodOf } from './calendar';
import { computeReview, type ReviewInput } from './review';
import { DEFAULT_THRESHOLDS, type WorkPackage } from './types';
import { hoursToMh } from './units';
import { expectShuffleInvariant } from '../../../tests/support/shuffle-invariant';

/**
 * `computeReview` on a Project with NO Unplanned Work: every hour is on a baselined Work
 * Package. Each Unplanned component's `share` divides by cumulative Unplanned, so without its
 * zero guard the whole Review — behind six pages — would throw `ratio`'s RangeError here.
 */
const wp: WorkPackage = {
  id: 'WP-B',
  wbsCode: '1.1',
  name: 'Build',
  parentId: null,
  isLeaf: true,
  isMilestone: false,
  isCatchAll: false,
  plannedMh: hoursToMh(200),
  actualStart: null,
  actualFinish: null,
  assignedResourceIds: [],
};

const input: ReviewInput = {
  project: {
    id: 'p',
    name: 'p',
    clientName: 'c',
    contractType: '準委任',
    tzOffsetMinutes: 540,
    teireiWeekday: 4,
    defaultRateYenPerHour: 4000n,
    eacMethod: 'typical',
    thresholds: DEFAULT_THRESHOLDS,
  },
  calendar: { id: 'cal', holidays: {} },
  wps: [wp],
  baselineVersions: [
    {
      seq: 1,
      id: 'bl-1',
      reason: 'x',
      recordedAt: '2026-06-01T00:00:00.000Z',
      actor: 'user:pm',
      wps: [
        { wpId: 'WP-B', start: '2026-06-01', finish: '2026-12-01', baselineMh: hoursToMh(200), isMilestone: false, isCatchAll: false },
      ],
    },
  ],
  activeBaselineSeq: 1,
  measurementBasis: 'hours',
  resolvedStatusIds: new Set(['Closed']),
  ledger: [
    {
      seq: 1,
      ticketId: 'tb',
      kind: 'delta',
      deltaMh: hoursToMh(30),
      windowStart: null,
      windowEnd: '2026-09-15T09:00:00.000Z',
      assigneeAccountId: 'acct-1',
      activeBaselineVersionSeq: 1,
    },
  ],
  mappingEvents: [{ seq: 1, ticketId: 'tb', wpId: 'WP-B', source: 'manual', at: 'x', actor: 'pm' }],
  pinnedSnapshot: {
    snapshotId: 'snap-1',
    observedAt: '2026-09-16T09:00:00.000Z',
    hoursFieldPresent: true,
    adapterKind: 'fixture',
    tickets: [
      {
        trackerIssueId: 'tb',
        key: 'tb',
        title: 'tb',
        statusId: 'Open',
        estimateMh: null,
        actualMh: hoursToMh(30),
        assigneeAccountId: 'acct-1',
        createdAt: '2026-06-01T00:00:00.000Z',
        parentIssueId: null,
        issueTypeId: 'Task',
        trackerProjectId: null,
        attributes: [],
      },
    ],
  },
  resources: [
    {
      id: 'r1',
      name: 'R',
      departmentId: 'd',
      trackerAccountIds: ['acct-1'],
      rates: [{ seq: 1, effectiveFrom: '2026-01-01', yenPerHour: 5000n }],
    },
  ],
  period: periodOf('2026-09-16T09:00:00.000Z', 540, 4),
  asOf: '2026-09-16',
  dispositions: [],
};

describe('computeReview with no Unplanned Work', () => {
  it('does not throw, and every Unplanned component share is null', () => {
    const r = computeReview(input);
    expect(r.attribution.cumulative.totalMh).toBe(hoursToMh(30));
    expect(r.unplanned.cumulative.unplannedMh).toBe(0n);
    expect(r.unplanned.components).toHaveLength(3);
    expect(r.unplanned.components.map((c) => c.share)).toEqual([null, null, null]);
  });

  it('reports SM-C1 Catch-all share (never 0 when unavailable)', () => {
    const r = computeReview(input);
    // No Catch-all hours in the base fixture → share 0/total is a value, not unavailable.
    expect(r.catchAllShare).toEqual({
      kind: 'value',
      value: { num: 0n, den: hoursToMh(30) },
      unit: 'ratio',
      coverage: null,
    });
    const empty = computeReview({ ...input, ledger: [] });
    expect(empty.catchAllShare).toEqual({ kind: 'unavailable', reasonCode: 'no_hours' });
  });

  it('reports non-zero SM-C1 as (catchAllMh + overflow) / totalMh', () => {
    const catchWp: WorkPackage = { ...wp, id: 'WP-C', wbsCode: '1.9', name: 'Misc', isCatchAll: true };
    const withCatchAll = computeReview({
      ...input,
      wps: [wp, catchWp],
      baselineVersions: [
        {
          ...input.baselineVersions[0]!,
          wps: [
            ...input.baselineVersions[0]!.wps,
            {
              wpId: 'WP-C',
              start: '2026-06-01',
              finish: '2026-12-01',
              baselineMh: hoursToMh(10),
              isMilestone: false,
              isCatchAll: true,
            },
          ],
        },
      ],
      mappingEvents: [
        ...input.mappingEvents,
        { seq: 2, ticketId: 'tc', wpId: 'WP-C', source: 'rule', at: 'x', actor: 'sys' },
      ],
      ledger: [
        ...input.ledger,
        {
          seq: 2,
          ticketId: 'tc',
          kind: 'delta',
          deltaMh: hoursToMh(25),
          windowStart: null,
          windowEnd: '2026-09-15T09:00:00.000Z',
          assigneeAccountId: 'acct-1',
          activeBaselineVersionSeq: 1,
        },
      ],
      pinnedSnapshot: {
        ...input.pinnedSnapshot,
        tickets: [
          ...input.pinnedSnapshot.tickets,
          {
            ...input.pinnedSnapshot.tickets[0]!,
            trackerIssueId: 'tc',
            key: 'tc',
            title: 'tc',
            actualMh: hoursToMh(25),
          },
        ],
      },
      wpFlagEvents: [{ seq: 1, wpId: 'WP-C', isCatchAll: true, actor: 'pm', at: 'x' }],
      wpFlagSeqMax: 1,
    });
    const c = withCatchAll.attribution.cumulative;
    expect(c.catchAllMh + c.catchAllOverflowMh).toBe(hoursToMh(25));
    expect(withCatchAll.catchAllShare).toEqual({
      kind: 'value',
      value: { num: hoursToMh(25), den: c.totalMh },
      unit: 'ratio',
      coverage: null,
    });
  });
});

describe('computeReview with no Baseline (story 2.2, decision Q1-A)', () => {
  // What the seeded demo looks like until Epic 4: no Baseline version, and every ledger entry
  // ingested with no Baseline active.
  const noBaseline: ReviewInput = {
    ...input,
    baselineVersions: [],
    activeBaselineSeq: null,
    ledger: input.ledger.map((e) => ({ ...e, activeBaselineVersionSeq: null })),
  };

  it('does not throw, and leaves every Baseline-derived figure null', () => {
    const r = computeReview(noBaseline);
    expect(r.evm).toBeNull();
    expect(r.money).toBeNull();
    expect(r.forecast).toBeNull();
    expect(r.milestones).toBeNull();
    expect(r.divergence).toBeNull();
    expect(r.behindPlan).toBe(false);
  });

  it('still computes Coverage, AC and the Unplanned split — every mapped hour is non-baselined', () => {
    const r = computeReview(noBaseline);
    expect(r.attribution.cumulative.totalMh).toBe(hoursToMh(30));
    expect(r.attribution.cumulative.mappedBaselinedMh).toBe(0n);
    expect(r.attribution.cumulative.mappedNonBaselinedMh).toBe(hoursToMh(30));
    expect(r.unplanned.cumulative.unplannedMh).toBe(hoursToMh(30));
    expect(r.unplanned.components.find((c) => c.key === 'non-baselined')?.mh).toBe(hoursToMh(30));
    expect(r.coverage.unmappedTickets).toBe(0);
    expect(r.coverage.mappedTicketShare).toEqual({ num: 1n, den: 1n });
    // Epic-5-retro F6: SM-5-aligned (all hours are mapped non-baselined here).
    expect(r.coverage.mappedHourShare).toEqual({
      kind: 'value',
      value: { num: hoursToMh(30), den: hoursToMh(30) },
      unit: 'ratio',
      coverage: null,
    });
  });

  it('marks all three indicators unavailable, so Overall is never red for want of a Baseline', () => {
    const r = computeReview(noBaseline);
    expect(r.health.indicators.map((i) => [i.key, i.colour])).toEqual([
      ['schedule', 'unavailable'],
      ['effort_cost', 'unavailable'],
      ['unplanned', 'unavailable'],
    ]);
    expect(r.health.overall).toBe('unavailable');
    expect(r.health.indicators.map((i) => i.rule)).toEqual([
      'Unavailable — no Baseline yet',
      'Unavailable — no Baseline yet',
      'Unavailable — no Baseline yet',
    ]);
    expect(r.health.resolvedThresholds.source).toBe('default');
  });

  const milestoneWp: WorkPackage = {
    ...wp,
    id: 'WP-M',
    wbsCode: '2.0',
    name: 'Gate',
    isMilestone: true,
    plannedMh: 0n,
  };
  const withMilestoneBaseline = {
    ...input,
    tenantHealthThresholds: DEFAULT_THRESHOLDS,
    wps: [wp, milestoneWp],
    baselineVersions: [
      {
        ...input.baselineVersions[0]!,
        wps: [
          ...input.baselineVersions[0]!.wps,
          {
            wpId: 'WP-M',
            start: '2026-06-01',
            finish: '2026-06-15',
            baselineMh: 0n,
            isMilestone: true,
            isCatchAll: false,
          },
        ],
      },
    ],
  };

  it('stamps Project-resolved thresholds on health.resolvedThresholds', () => {
    const r = computeReview({
      ...withMilestoneBaseline,
      projectHealthOverride: { ratioGreen: { num: 99n, den: 100n } },
    });
    expect(r.health.resolvedThresholds.source).toBe('project');
    expect(r.health.resolvedThresholds.thresholds.ratioGreen).toEqual({ num: 99n, den: 100n });
  });

  it('Schedule Health: negative Float alone → red and names Float', () => {
    const r = computeReview({
      ...withMilestoneBaseline,
      scheduleHealth: {
        anchor: { kind: 'project_finish', date: '2026-12-01' },
        wps: [
          { wpId: 'WP-B', floatDays: -2, earlyFinish: '2026-12-15' },
          { wpId: 'WP-M', floatDays: 0, earlyFinish: '2026-06-15' },
        ],
        violations: [],
      },
    });
    const s = r.health.indicators.find((i) => i.key === 'schedule')!;
    expect(s.colour).toBe('red');
    expect(s.rule).toMatch(/minimum Float/);
    expect(r.health.overall).toBe('red');
  });

  it('Schedule Health: Milestone MFO alone → red and names worst + days late', () => {
    const r = computeReview({
      ...withMilestoneBaseline,
      scheduleHealth: {
        anchor: { kind: 'project_finish', date: '2026-12-01' },
        wps: [
          { wpId: 'WP-B', floatDays: 1, earlyFinish: '2026-12-01' },
          { wpId: 'WP-M', floatDays: 0, earlyFinish: '2026-06-15' },
        ],
        violations: [{ wpId: 'WP-M', constraintType: 'must_finish_on', daysLate: 5 }],
      },
    });
    const s = r.health.indicators.find((i) => i.key === 'schedule')!;
    expect(s.colour).toBe('red');
    expect(s.rule).toMatch(/must-finish-on/);
    expect(s.rule).toMatch(/5 working day/);
    expect(s.rule).toMatch(/Milestone/);
  });

  it('Schedule Health: derived Milestone slip alone → ≥ amber and names derived-slip', () => {
    const r = computeReview({
      ...withMilestoneBaseline,
      scheduleHealth: {
        anchor: { kind: 'project_finish', date: '2026-12-01' },
        wps: [
          { wpId: 'WP-B', floatDays: 1, earlyFinish: '2026-12-01' },
          { wpId: 'WP-M', floatDays: 0, earlyFinish: '2026-07-01' },
        ],
        violations: [],
      },
    });
    const s = r.health.indicators.find((i) => i.key === 'schedule')!;
    // Fixture SPI may already be red; derived slip still names itself and is ≥ amber.
    expect(['amber', 'red']).toContain(s.colour);
    expect(s.rule).toMatch(/derived-date Milestone slip/);
  });

  it('still throws for a Baseline seq that names no version — an inconsistent input, not a missing Baseline', () => {
    expect(() => computeReview({ ...noBaseline, activeBaselineSeq: 7 })).toThrow(
      'no baseline version with seq 7',
    );
  });
});

describe('computeReview forecast dual finishes (Story 6.6 / FR-32)', () => {
  it('threads scheduleHealth.computedFinish and baselineProjectStart into forecast', () => {
    // Closed + estimate → EV > 0 so SPI > 0 and the trend finish is present (disagrees with computed).
    const r = computeReview({
      ...input,
      pinnedSnapshot: {
        ...input.pinnedSnapshot,
        tickets: [
          {
            ...input.pinnedSnapshot.tickets[0]!,
            statusId: 'Closed',
            estimateMh: hoursToMh(200),
          },
        ],
      },
      scheduleHealth: {
        anchor: { kind: 'computed_finish', date: '2026-11-01' },
        computedFinish: '2026-11-01',
        wps: [{ wpId: 'WP-B', floatDays: 2, earlyFinish: '2026-11-01' }],
        violations: [],
      },
      baselineProjectStart: '2026-06-01',
    });
    expect(r.forecast).not.toBeNull();
    expect(r.forecast!.computedFinish).toBe('2026-11-01');
    expect(r.forecast!.baselineStart).toBe('2026-06-01');
    expect(r.forecast!.forecastFinish).toBe('2026-09-17');
    expect(r.forecast!.trendFinish).toBe('2026-09-17');
    expect(r.forecast!.finishGapWd).toBe(-31);
  });

  it('leaves computedFinish null when scheduleHealth omits it', () => {
    const r = computeReview(input);
    expect(r.forecast).not.toBeNull();
    expect(r.forecast!.computedFinish).toBeNull();
    expect(r.forecast!.finishGapWd).toBeNull();
    expect(r.forecast!.trendFinish).toBe(r.forecast!.forecastFinish);
  });
});

describe('computeReview divergence carries the WP\'s actual dates', () => {
  it('a WP with actual dates carries them in its divergence row', () => {
    const r = computeReview({
      ...input,
      wps: [{ ...wp, actualStart: '2026-06-02', actualFinish: '2026-09-10' }],
    });
    expect(r.divergence).toEqual([
      expect.objectContaining({ wpId: 'WP-B', actualStart: '2026-06-02', actualFinish: '2026-09-10' }),
    ]);
  });
});

describe('computeReview EV fall + dual CPI + money (story 6.2)', () => {
  it('exposes evFell on Divergence when priorEvByWp shows a drop; absent prior → false', () => {
    const withPrior = computeReview({
      ...input,
      priorEvByWp: new Map([['WP-B', hoursToMh(999)]]),
    });
    expect(withPrior.divergence![0]!.evFell).toBe(true);
    expect(computeReview(input).divergence![0]!.evFell).toBe(false);
  });

  it('keeps both CPIs with Unplanned AC, money at Project default Rate, and Unplanned outside EVM PV/EV', () => {
    const withUnplanned = computeReview({
      ...input,
      ledger: [
        ...input.ledger,
        {
          seq: 2,
          ticketId: 'tu',
          kind: 'delta',
          deltaMh: hoursToMh(10),
          windowStart: null,
          windowEnd: '2026-09-15T09:00:00.000Z',
          assigneeAccountId: 'acct-1',
          activeBaselineVersionSeq: 1,
        },
      ],
      // tu stays unmapped → Unplanned AC
      pinnedSnapshot: {
        ...input.pinnedSnapshot,
        tickets: [
          ...input.pinnedSnapshot.tickets,
          {
            trackerIssueId: 'tu',
            key: 'tu',
            title: 'tu',
            statusId: 'Open',
            estimateMh: null,
            actualMh: hoursToMh(10),
            assigneeAccountId: 'acct-1',
            createdAt: '2026-06-01T00:00:00.000Z',
            parentIssueId: null,
            issueTypeId: 'Task',
            trackerProjectId: null,
            attributes: [],
          },
        ],
      },
    });
    const baselineOnly = computeReview(input);
    expect(withUnplanned.unplanned.cumulative.unplannedMh).toBe(hoursToMh(10));
    expect(withUnplanned.evm).not.toBeNull();
    expect(withUnplanned.evm!.cpiAllIn.kind).toBe('value');
    expect(withUnplanned.evm!.cpiPlannedScope.kind).toBe('value');
    // All-in uses total AC (baselined + Unplanned); planned-scope excludes Unplanned → CPIs differ.
    expect(withUnplanned.evm!.cpiAllIn).not.toEqual(withUnplanned.evm!.cpiPlannedScope);
    // Unplanned carries AC only (PV=EV=0): Project PV/EV ignore the Unplanned line.
    expect(withUnplanned.evm!.pvMh).toEqual(baselineOnly.evm!.pvMh);
    expect(withUnplanned.evm!.evMh).toEqual(baselineOnly.evm!.evMh);
    // Roll-up AC = baselined leaf AC + Unplanned.
    expect(withUnplanned.attribution.cumulative.totalMh).toBe(
      withUnplanned.attribution.cumulative.mappedBaselinedMh +
        withUnplanned.unplanned.cumulative.unplannedMh,
    );
    expect(withUnplanned.evm!.acMh).toEqual({
      kind: 'value',
      value: withUnplanned.attribution.cumulative.totalMh,
      unit: 'mh',
      coverage: null,
    });
    expect(withUnplanned.money).not.toBeNull();
    expect(withUnplanned.money!.pvJpy).toBeGreaterThan(0n);
  });
});

describe('computeReview milestones read the head actual finish', () => {
  const milestone: WorkPackage = {
    ...wp,
    id: 'WP-M',
    wbsCode: '2',
    name: 'Sign-off',
    isMilestone: true,
    plannedMh: 0n,
  };
  const withMilestone = (actualFinish: string | null): ReviewInput => ({
    ...input,
    wps: [wp, { ...milestone, actualFinish }],
    baselineVersions: [
      {
        ...input.baselineVersions[0]!,
        wps: [
          ...input.baselineVersions[0]!.wps,
          { wpId: 'WP-M', start: '2026-09-01', finish: '2026-09-01', baselineMh: 0n, isMilestone: true, isCatchAll: false },
        ],
      },
    ],
  });

  it('a milestone with an actual finish is done, not slipped', () => {
    const [row] = computeReview(withMilestone('2026-09-03')).milestones!;
    expect(row).toMatchObject({ name: 'Sign-off', doneDate: '2026-09-03', slipped: false });
  });

  it('a milestone past its Baseline date with no actual finish has slipped', () => {
    const [row] = computeReview(withMilestone(null)).milestones!;
    expect(row).toMatchObject({ doneDate: null, slipped: true });
  });
});

/**
 * Story 2.3 (Q2-A): the milestone and Divergence rows come back in `compareWp` order (AD-28), not
 * input order. The `1.2`/`1.02` pair ties on the integer and its ids run AGAINST the old code-point
 * order (which put `1.02` first), so the id tie-break is visible; `1a` checks the natural order.
 */
describe('computeReview orders milestone and Divergence rows by compareWp', () => {
  const shapes: readonly (readonly [string, string])[] = [
    // [id suffix, wbsCode]
    ['a', '1.10'],
    ['b', '1.2'],
    ['z', '1.02'],
    ['c', '1a'],
  ];
  const milestones: WorkPackage[] = shapes.map(([suffix, wbsCode]) => ({
    ...wp,
    id: `m-${suffix}`,
    wbsCode,
    name: `m-${suffix}`,
    // Not leaves, so the Divergence rows below are exactly the leaf set.
    isLeaf: false,
    isMilestone: true,
    plannedMh: 0n,
  }));
  const leaves: WorkPackage[] = shapes.map(([suffix, wbsCode]) => ({
    ...wp,
    id: `l-${suffix}`,
    wbsCode,
    name: `l-${suffix}`,
  }));
  const allWps: readonly WorkPackage[] = [...milestones, wp, ...leaves];

  /** The Baseline rows follow the WP order handed in, so a shuffle reorders both lists. */
  const reviewOf = (wps: readonly WorkPackage[]) =>
    computeReview({
      ...input,
      wps: [...wps],
      baselineVersions: [
        {
          ...input.baselineVersions[0]!,
          wps: wps.map((w) => ({
            wpId: w.id,
            start: '2026-09-01',
            finish: '2026-09-01',
            baselineMh: w.isMilestone ? 0n : hoursToMh(200),
            isMilestone: w.isMilestone,
            isCatchAll: w.isCatchAll,
          })),
        },
      ],
    });

  const ordering = (wps: readonly WorkPackage[]) => {
    const r = reviewOf(wps);
    return {
      milestones: r.milestones!.map((m) => [m.name, m.wbsCode]),
      divergence: r.divergence!.map((d) => [d.wpId, d.wbsCode]),
    };
  };

  it('returns the exact compareWp sequences', () => {
    expect(ordering(allWps)).toEqual({
      milestones: [
        ['m-b', '1.2'],
        ['m-z', '1.02'],
        ['m-a', '1.10'],
        ['m-c', '1a'],
      ],
      divergence: [
        ['WP-B', '1.1'],
        ['l-b', '1.2'],
        ['l-z', '1.02'],
        ['l-a', '1.10'],
        ['l-c', '1a'],
      ],
    });
  });

  it('is stable over shuffled input.wps', () => {
    expectShuffleInvariant(ordering, allWps, 50);
  });
});

describe('computeReview Ticket-Count Mode Unplanned share', () => {
  it('uses period ticket counts, not hour buckets, for sharePeriod', () => {
    const period = periodOf('2026-09-16T09:00:00.000Z', 540, 4);
    const r = computeReview({
      ...input,
      measurementBasis: 'count',
      ledger: [],
      period,
      pinnedSnapshot: {
        ...input.pinnedSnapshot,
        tickets: [
          {
            trackerIssueId: 'u1',
            key: 'u1',
            title: 'u1',
            statusId: 'Open',
            estimateMh: null,
            actualMh: null,
            assigneeAccountId: null,
            createdAt: '2026-09-15T09:00:00.000Z',
            parentIssueId: null,
            issueTypeId: 'Task',
            trackerProjectId: null,
            attributes: [],
          },
          {
            trackerIssueId: 'm1',
            key: 'm1',
            title: 'm1',
            statusId: 'Open',
            estimateMh: null,
            actualMh: null,
            assigneeAccountId: null,
            createdAt: '2026-09-15T09:00:00.000Z',
            parentIssueId: null,
            issueTypeId: 'Task',
            trackerProjectId: null,
            attributes: [],
          },
        ],
      },
      mappingEvents: [
        { seq: 1, ticketId: 'm1', wpId: 'WP-B', source: 'manual', at: 'x', actor: 'pm' },
      ],
    });
    expect(r.unplanned.sharePeriod).toEqual({ num: 1n, den: 2n });
    expect(r.unplanned.ticketCountPeriod).toBe(1);
    expect(r.unplanned.period.totalMh).toBe(0n);
    // Harry D1=B: count-only Coverage hourShare → Review mappedHourShare unavailable, not 0.0%.
    expect(r.coverage.perConnector.projectTotal.hourShare).toEqual({
      kind: 'unavailable',
      reasonCode: 'tracker_provides_no_hours',
    });
    expect(r.coverage.mappedHourShare).toEqual({
      kind: 'unavailable',
      reasonCode: 'tracker_provides_no_hours',
    });
  });
});

describe('computeReview flags Tickets a rule moved to Unmapped (story 5.10 / UX-DR23 / Q3)', () => {
  const ruleEvents = [
    { seq: 1, ticketId: 'tb', wpId: 'WP-B', source: 'rule' as const, ruleId: 'rule-1', at: 'x', actor: 'a' },
    { seq: 2, ticketId: 'tb', wpId: null, source: 'rule' as const, ruleId: 'rule-1', at: 'x', actor: 'a' },
  ];

  it('names the rule the Ticket left, for as long as it stays unmapped', () => {
    const r = computeReview({
      ...input,
      mappingEvents: ruleEvents,
      ruleNamesById: new Map([['rule-1', 'Support → 7.3']]),
    });
    expect(r.ruleUnmapped).toEqual([
      { ticketId: 'tb', key: 'tb', title: 'tb', ruleId: 'rule-1', ruleName: 'Support → 7.3', mh: hoursToMh(30) },
    ]);
  });

  it('clears once the Ticket is mapped again, and at a pin before the move', () => {
    const remapped = [
      ...ruleEvents,
      { seq: 3, ticketId: 'tb', wpId: 'WP-B', source: 'manual' as const, at: 'x', actor: 'pm' },
    ];
    expect(computeReview({ ...input, mappingEvents: remapped }).ruleUnmapped).toEqual([]);
    expect(computeReview({ ...input, mappingEvents: ruleEvents, mappingSeqMax: 1 }).ruleUnmapped).toEqual([]);
  });

  it('a release (back to rules) is not flagged', () => {
    const released = [{ seq: 1, ticketId: 'tb', wpId: null, source: 'release' as const, at: 'x', actor: 'pm' }];
    expect(computeReview({ ...input, mappingEvents: released }).ruleUnmapped).toEqual([]);
  });
});

describe('computeReview scope honesty (story 5.13 / FR-20)', () => {
  const ticket = (
    id: string,
    opts: { actualMh?: bigint | null; issueTypeId?: string } = {},
  ) => ({
    trackerIssueId: id,
    key: id,
    title: id,
    statusId: 'Open',
    estimateMh: null,
    actualMh: opts.actualMh === undefined ? hoursToMh(0) : opts.actualMh,
    assigneeAccountId: 'acct-1' as string | null,
    createdAt: '2026-06-01T00:00:00.000Z',
    parentIssueId: null,
    issueTypeId: opts.issueTypeId ?? 'Task',
    trackerProjectId: null,
    attributes: [] as { kind: 'category'; id: string }[],
  });

  it('lists every in-scope Ticket as mapped or unmapped — including 0h and orphan wpId', () => {
    const r = computeReview({
      ...input,
      mappingEvents: [
        { seq: 1, ticketId: 'tb', wpId: 'WP-B', source: 'manual', at: 'x', actor: 'pm' },
        { seq: 2, ticketId: 'orphan', wpId: 'WP-GONE', source: 'manual', at: 'x', actor: 'pm' },
        // zero-h unmapped has no mapping event
      ],
      ledger: [
        {
          seq: 1,
          ticketId: 'tb',
          kind: 'delta',
          deltaMh: hoursToMh(30),
          windowStart: null,
          windowEnd: '2026-09-15T09:00:00.000Z',
          assigneeAccountId: 'acct-1',
          activeBaselineVersionSeq: 1,
          connectorId: 'con-a',
        },
      ],
      pinnedSnapshot: {
        ...input.pinnedSnapshot,
        tickets: [
          ticket('tb', { actualMh: hoursToMh(30) }),
          ticket('orphan', { actualMh: hoursToMh(5), issueTypeId: 'Bug' }),
          ticket('zero', { actualMh: 0n, issueTypeId: 'Task' }),
        ],
      },
    });
    const listedIds = r.unmappedGroups.flatMap((g) => g.tickets.map((t) => t.ticketId)).sort();
    expect(listedIds).toEqual(['orphan', 'zero']);
    expect(r.coverage.unmappedTickets).toBe(2);
    // Mapped leaf stays out of Unmapped.
    expect(listedIds).not.toContain('tb');
    // Story 6.7: expanded Unmapped Tickets carry money (hours × Project default Rate).
    const orphan = r.unmappedGroups.flatMap((g) => g.tickets).find((t) => t.ticketId === 'orphan');
    expect(orphan).toEqual(expect.objectContaining({ jpy: expect.any(BigInt) }));
  });

  it('keeps left-scope Tickets out of Unmapped groups', () => {
    const r = computeReview({
      ...input,
      mappingEvents: [],
      leftScopeTicketIds: new Set(['tb']),
      pinnedSnapshot: {
        ...input.pinnedSnapshot,
        tickets: [ticket('tb', { actualMh: hoursToMh(30) })],
      },
    });
    expect(r.unmappedGroups).toEqual([]);
    expect(r.coverage.unmappedTickets).toBe(0);
  });

  it('keeps snapshot.ticketCount as the full pin while coverage stays in-scope only', () => {
    const r = computeReview({
      ...input,
      mappingEvents: [],
      leftScopeTicketIds: new Set(['tb']),
      pinnedSnapshot: {
        ...input.pinnedSnapshot,
        tickets: [
          ticket('tb', { actualMh: hoursToMh(30) }),
          ticket('still-in', { actualMh: 0n }),
        ],
      },
    });
    expect(r.snapshot.ticketCount).toBe(2);
    expect(r.coverage.unmappedTickets).toBe(1);
    expect(r.coverage.mappedTicketShare).toEqual({ num: 0n, den: 1n });
  });

  it('exposes per-Connector Opening Balances and omits the caption when there is no OB', () => {
    const withOb = computeReview({
      ...input,
      connectorsForCoverage: [
        { id: 'con-a', label: 'Space A', measurementBasis: 'hours' },
        { id: 'con-b', label: 'Space B', measurementBasis: 'hours' },
      ],
      ledger: [
        {
          seq: 1,
          ticketId: 'tb',
          kind: 'opening_balance',
          deltaMh: hoursToMh(40),
          windowStart: null,
          windowEnd: '2026-08-01T09:00:00.000Z',
          assigneeAccountId: 'acct-1',
          activeBaselineVersionSeq: 1,
          connectorId: 'con-a',
        },
        {
          seq: 2,
          ticketId: 'tb2',
          kind: 'opening_balance',
          deltaMh: hoursToMh(25),
          windowStart: null,
          windowEnd: '2026-08-01T09:00:00.000Z',
          assigneeAccountId: 'acct-1',
          activeBaselineVersionSeq: 1,
          connectorId: 'con-b',
        },
        {
          seq: 3,
          ticketId: 'tb',
          kind: 'delta',
          deltaMh: hoursToMh(10),
          windowStart: null,
          windowEnd: '2026-09-15T09:00:00.000Z',
          assigneeAccountId: 'acct-1',
          activeBaselineVersionSeq: 1,
          connectorId: 'con-a',
        },
      ],
      mappingEvents: [
        { seq: 1, ticketId: 'tb', wpId: 'WP-B', source: 'manual', at: 'x', actor: 'pm' },
        { seq: 2, ticketId: 'tb2', wpId: 'WP-B', source: 'manual', at: 'x', actor: 'pm' },
      ],
      pinnedSnapshot: {
        ...input.pinnedSnapshot,
        tickets: [
          ticket('tb', { actualMh: hoursToMh(50) }),
          ticket('tb2', { actualMh: hoursToMh(25) }),
        ],
      },
    });
    expect(withOb.openingBalanceMh).toBe(hoursToMh(65));
    expect(withOb.openingBalanceByConnector).toEqual([
      { connectorId: 'con-a', label: 'Space A', mh: hoursToMh(40) },
      { connectorId: 'con-b', label: 'Space B', mh: hoursToMh(25) },
    ]);
    // Epic-5-retro F6: mappedHourShare uses Coverage ledgerNoOb den (10h), not OB+delta (75h).
    const hourShare = withOb.coverage.perConnector.projectTotal.hourShare;
    expect(hourShare.kind).toBe('value');
    if (hourShare.kind !== 'value') throw new Error('expected value');
    expect(withOb.coverage.mappedHourShare).toEqual({
      kind: 'value',
      value: hourShare.mappedExcludingCatchAll,
      unit: 'ratio',
      coverage: null,
    });
    expect(withOb.coverage.mappedHourShare).toEqual({
      kind: 'value',
      value: { num: hoursToMh(10), den: hoursToMh(10) },
      unit: 'ratio',
      coverage: null,
    });
    // Attribution still sees OB in its total — that is why the old ratio drifted from SM-5.
    expect(withOb.attribution.cumulative.totalMh).toBe(hoursToMh(75));

    const noOb = computeReview(input);
    expect(noOb.openingBalanceMh).toBe(0n);
    expect(noOb.openingBalanceByConnector).toEqual([]);
  });

  it('surfaces the latest scope change with nested left-scope Tickets and hours', () => {
    const r = computeReview({
      ...input,
      connectorsForCoverage: [{ id: 'con-a', label: 'Space A', measurementBasis: 'hours' }],
      connectorScopeEvents: [
        {
          seq: 1,
          connectorId: 'con-a',
          scope: 'projectKey=OLD',
          at: '2026-08-01T00:00:00.000Z',
        },
        {
          seq: 2,
          connectorId: 'con-a',
          scope: 'projectKey=NEW',
          at: '2026-09-01T00:00:00.000Z',
        },
      ],
      leftScopeTicketDetails: [
        {
          trackerIssueId: 'gone-1',
          key: 'GONE-1',
          ownerConnectorId: 'con-a',
          hoursMh: hoursToMh(12),
        },
      ],
      leftScopeTicketIds: new Set(['gone-1']),
    });
    expect(r.latestScopeChanges).toEqual([
      {
        connectorId: 'con-a',
        label: 'Space A',
        previousScope: 'projectKey=OLD',
        newScope: 'projectKey=NEW',
        at: '2026-09-01T00:00:00.000Z',
        leftScopeTickets: [{ ticketId: 'gone-1', key: 'GONE-1', hoursMh: hoursToMh(12) }],
      },
    ]);
  });

  it('still shows a scope change when left-scope is empty', () => {
    const r = computeReview({
      ...input,
      connectorsForCoverage: [{ id: 'con-a', label: 'Space A', measurementBasis: 'hours' }],
      connectorScopeEvents: [
        { seq: 1, connectorId: 'con-a', scope: 'a', at: '2026-08-01T00:00:00.000Z' },
        { seq: 2, connectorId: 'con-a', scope: 'b', at: '2026-09-01T00:00:00.000Z' },
      ],
    });
    expect(r.latestScopeChanges).toHaveLength(1);
    expect(r.latestScopeChanges[0]!.leftScopeTickets).toEqual([]);
  });
});

describe('Unplanned Work and the Review never name a person (story 5.14 / FR-26 / UX-DR29)', () => {
  // Distinct sentinels per kind of identity, so a leak names what leaked.
  const people = [
    { id: 'SENTINEL-RESOURCE-ID-A', name: 'Sentinel Person Name A', accountId: 'SENTINEL-ACCOUNT-ID-A' },
    { id: 'SENTINEL-RESOURCE-ID-B', name: 'Sentinel Person Name B', accountId: 'SENTINEL-ACCOUNT-ID-B' },
  ];
  const resources = people.map((p) => ({
    id: p.id,
    name: p.name,
    departmentId: 'd',
    trackerAccountIds: [p.accountId],
    rates: [{ seq: 1, effectiveFrom: '2026-01-01', yenPerHour: 5000n }],
  }));
  const ticket = (id: string, assigneeAccountId: string) => ({
    trackerIssueId: id,
    key: id,
    title: id,
    statusId: 'Open',
    estimateMh: null,
    actualMh: hoursToMh(8),
    assigneeAccountId,
    createdAt: '2026-06-01T00:00:00.000Z',
    parentIssueId: null,
    issueTypeId: 'Bug',
    trackerProjectId: null,
    attributes: [] as { kind: 'category'; id: string }[],
  });
  const delta = (seq: number, ticketId: string, assigneeAccountId: string) => ({
    seq,
    ticketId,
    kind: 'delta' as const,
    deltaMh: hoursToMh(8),
    windowStart: null,
    windowEnd: '2026-09-15T09:00:00.000Z',
    assigneeAccountId,
    activeBaselineVersionSeq: 1,
  });
  /** Unmapped Tickets `t0…`, one per assignee, plus the fixture's mapped `tb` re-assigned to the first. */
  const inputWith = (assignees: readonly string[]): ReviewInput => ({
    ...input,
    resources,
    ledger: [
      ...input.ledger.map((e) => ({ ...e, assigneeAccountId: assignees[0]! })),
      ...assignees.map((a, i) => delta(input.ledger.length + i + 1, `t${i}`, a)),
    ],
    pinnedSnapshot: {
      ...input.pinnedSnapshot,
      tickets: [
        ...input.pinnedSnapshot.tickets.map((tk) => ({ ...tk, assigneeAccountId: assignees[0]! })),
        ...assignees.map((a, i) => ticket(`t${i}`, a)),
      ],
    },
  });
  const reviewWith = (assignees: readonly string[]) => computeReview(inputWith(assignees));
  const serialise = (value: unknown): string =>
    JSON.stringify(value, (_k, v: unknown) => {
      if (typeof v === 'bigint') return v.toString();
      if (v instanceof Set) return [...v];
      if (v instanceof Map) return [...v.entries()];
      return v;
    });
  const sentinels = people.flatMap((p) => [p.accountId, p.id, p.name]);
  const groupView = (r: ReturnType<typeof computeReview>) =>
    r.unmappedGroups.map((g) => ({ key: g.key, label: g.label, attribute: g.attribute }));

  it('gives a Ticket the same group key and label whoever it is assigned to', () => {
    const asA = reviewWith([people[0]!.accountId]);
    const asB = reviewWith([people[1]!.accountId]);
    expect(groupView(asA)).toEqual(groupView(asB));
    expect(asA.unmappedGroups).toEqual(asB.unmappedGroups);
  });

  it('puts two Tickets that differ only in assignee in one group, with one key and label', () => {
    const r = reviewWith(people.map((p) => p.accountId));
    expect(r.unmappedGroups).toHaveLength(1);
    expect(r.unmappedGroups[0]!.ticketCount).toBe(2);
  });

  it('carries no Tracker Account id, Resource id or person name anywhere in the Review output', () => {
    const reviewInput = inputWith(people.map((p) => p.accountId));
    // The sentinels ARE in the input — otherwise their absence below would prove nothing.
    const given = serialise(reviewInput);
    for (const s of sentinels) expect(given, `sentinel ${s} missing from the input`).toContain(s);

    const output = serialise(computeReview(reviewInput));
    const leaked = sentinels.filter((s) => output.includes(s));
    expect(leaked, `person identity leaked into the Review output: ${leaked.join(', ')}`).toEqual([]);
  });
});

describe('computeReview Observed-vs-Recorded gap list (story 6.4)', () => {
  const gapInput = (overrides: Partial<ReviewInput> = {}): ReviewInput => ({
    ...input,
    measurementBasis: 'hours',
    ...overrides,
  });

  it('is null without a Baseline (same PARTIAL as divergence)', () => {
    const r = computeReview(gapInput({ activeBaselineSeq: null }));
    expect(r.observedVsRecorded).toBeNull();
    expect(r.divergence).toBeNull();
  });

  it('treats null Recorded as 0% for gap and EVRec, source none', () => {
    // Base fixture: one mapped open ticket → Observed 0% (no-evidence or count 0) — force
    // a large Observed by marking the ticket Closed with estimate basis.
    const withObs = gapInput({
      pinnedSnapshot: {
        ...input.pinnedSnapshot,
        tickets: [
          {
            ...input.pinnedSnapshot.tickets[0]!,
            statusId: 'Closed',
            estimateMh: hoursToMh(100),
          },
        ],
      },
      // No recordedPctByWp → null Recorded
    });
    const r = computeReview(withObs);
    expect(r.observedVsRecorded).not.toBeNull();
    const row = r.observedVsRecorded!.find((x) => x.wpId === 'WP-B');
    expect(row).toBeDefined();
    expect(row!.recordedPct).toBeNull();
    expect(row!.recordedSource).toBe('none');
    expect(row!.evRecordedMh).toBe(0n);
    expect(row!.estimateDrivenEv).toBe(true);
  });

  it('lists only leaf WPs with |gap| > 10 pts, worst first', () => {
    const wpA: WorkPackage = { ...wp, id: 'WP-A', wbsCode: '1.0', name: 'A' };
    const wpC: WorkPackage = { ...wp, id: 'WP-C', wbsCode: '1.2', name: 'C' };
    const r = computeReview(
      gapInput({
        wps: [wpA, wp, wpC],
        baselineVersions: [
          {
            ...input.baselineVersions[0]!,
            wps: [
              {
                wpId: 'WP-A',
                start: '2026-06-01',
                finish: '2026-12-01',
                baselineMh: hoursToMh(100),
                isMilestone: false,
                isCatchAll: false,
              },
              input.baselineVersions[0]!.wps[0]!,
              {
                wpId: 'WP-C',
                start: '2026-06-01',
                finish: '2026-12-01',
                baselineMh: hoursToMh(100),
                isMilestone: false,
                isCatchAll: false,
              },
            ],
          },
        ],
        mappingEvents: [
          { seq: 1, ticketId: 'ta', wpId: 'WP-A', source: 'manual', at: 'x', actor: 'pm' },
          { seq: 2, ticketId: 'tb', wpId: 'WP-B', source: 'manual', at: 'x', actor: 'pm' },
          { seq: 3, ticketId: 'tc', wpId: 'WP-C', source: 'manual', at: 'x', actor: 'pm' },
        ],
        pinnedSnapshot: {
          ...input.pinnedSnapshot,
          tickets: [
            {
              ...input.pinnedSnapshot.tickets[0]!,
              trackerIssueId: 'ta',
              key: 'ta',
              statusId: 'Closed',
              estimateMh: hoursToMh(100),
            },
            {
              ...input.pinnedSnapshot.tickets[0]!,
              trackerIssueId: 'tb',
              key: 'tb',
              statusId: 'Closed',
              estimateMh: hoursToMh(50),
            },
            {
              ...input.pinnedSnapshot.tickets[0]!,
              trackerIssueId: 'tc',
              key: 'tc',
              statusId: 'Open',
              estimateMh: hoursToMh(100),
            },
          ],
        },
        recordedPctByWp: new Map([
          // A: Obs ~100% (capped 99), Rec 90% → gap ~9 pts — below threshold, excluded
          [
            'WP-A',
            {
              pct: { num: 90n, den: 100n },
              reason: null,
              source: 'plan_edit' as const,
            },
          ],
          // B: Obs with estimate 50/max(200,50)=50/200=25% vs Rec 0 → gap 25 > 10
          // C: Obs 0% vs Rec 0 → not listed
        ]),
        durationDaysByWp: new Map([
          ['WP-A', 10],
          ['WP-B', 10],
          ['WP-C', 10],
        ]),
      }),
    );
    expect(r.observedVsRecorded).not.toBeNull();
    const ids = r.observedVsRecorded!.map((x) => x.wpId);
    expect(ids).toContain('WP-B');
    expect(ids).not.toContain('WP-C');
    // A may or may not appear depending on 99% cap vs 90% (9 pts) — must not appear
    expect(ids).not.toContain('WP-A');
    // Worst first: if multiple rows, first has the largest gap
    for (let i = 1; i < r.observedVsRecorded!.length; i++) {
      const prev = r.observedVsRecorded![i - 1]!.gapAbs;
      const cur = r.observedVsRecorded![i]!.gapAbs;
      const prevV = Number(prev.num) / Number(prev.den);
      const curV = Number(cur.num) / Number(cur.den);
      expect(prevV).toBeGreaterThanOrEqual(curV);
    }
  });

  it('computes dual EV and remaining-duration consequence fields', () => {
    const r = computeReview(
      gapInput({
        pinnedSnapshot: {
          ...input.pinnedSnapshot,
          tickets: [
            {
              ...input.pinnedSnapshot.tickets[0]!,
              statusId: 'Closed',
              estimateMh: hoursToMh(100),
            },
          ],
        },
        recordedPctByWp: new Map([
          [
            'WP-B',
            {
              pct: { num: 10n, den: 100n },
              reason: 'QA pending',
              source: 'pm_override' as const,
            },
          ],
        ]),
        durationDaysByWp: new Map([['WP-B', 10]]),
      }),
    );
    const row = r.observedVsRecorded!.find((x) => x.wpId === 'WP-B')!;
    expect(row.recordedSource).toBe('pm_override');
    expect(row.recordedReason).toBe('QA pending');
    // EVRec = baselineMh × 10/100
    expect(row.evRecordedMh).toBe(hoursToMh(200) / 10n);
    expect(row.remainingDaysBefore).toBe(9); // ceil(10 * 0.9) = 9
    expect(row.remainingDaysAfter).not.toBeNull();
    expect(row.evObservedMh).toBeGreaterThan(0n);
  });

  it('flags estimate-driven EV on divergence rows', () => {
    const r = computeReview(
      gapInput({
        pinnedSnapshot: {
          ...input.pinnedSnapshot,
          tickets: [
            {
              ...input.pinnedSnapshot.tickets[0]!,
              statusId: 'Closed',
              estimateMh: hoursToMh(100),
            },
          ],
        },
      }),
    );
    const d = r.divergence!.find((x) => x.wpId === 'WP-B')!;
    expect(d.estimateDrivenEv).toBe(true);
  });

  it('excludes |gap| exactly equal to the Comfort threshold (10 pts)', () => {
    // Observed 50% (count: 1 of 2 Resolved) vs Recorded 40% → gap 10 pts → excluded.
    const r = computeReview(
      gapInput({
        mappingEvents: [
          { seq: 1, ticketId: 't1', wpId: 'WP-B', source: 'manual', at: 'x', actor: 'pm' },
          { seq: 2, ticketId: 't2', wpId: 'WP-B', source: 'manual', at: 'x', actor: 'pm' },
        ],
        pinnedSnapshot: {
          ...input.pinnedSnapshot,
          tickets: [
            {
              ...input.pinnedSnapshot.tickets[0]!,
              trackerIssueId: 't1',
              key: 't1',
              statusId: 'Closed',
              estimateMh: null,
            },
            {
              ...input.pinnedSnapshot.tickets[0]!,
              trackerIssueId: 't2',
              key: 't2',
              statusId: 'Open',
              estimateMh: null,
            },
          ],
        },
        recordedPctByWp: new Map([
          [
            'WP-B',
            {
              pct: { num: 40n, den: 100n },
              reason: null,
              source: 'plan_edit' as const,
            },
          ],
        ]),
      }),
    );
    expect(r.observedVsRecorded!.find((x) => x.wpId === 'WP-B')).toBeUndefined();
  });

  it('lists pmAdjusted from heads with non-empty reason even when the gap has closed', () => {
    const r = computeReview(
      gapInput({
        recordedPctByWp: new Map([
          [
            'WP-B',
            {
              pct: { num: 0n, den: 1n },
              reason: 'Accepted from evidence',
              source: 'pm_override' as const,
            },
          ],
        ]),
      }),
    );
    // Observed ~0 with no evidence vs Rec 0 → no gap row, but PM-adjusted remains.
    expect(r.observedVsRecorded!.find((x) => x.wpId === 'WP-B')).toBeUndefined();
    expect(r.pmAdjusted).toEqual([
      {
        wpId: 'WP-B',
        wbsCode: '1.1',
        name: 'Build',
        recordedPct: { num: 0n, den: 1n },
        reason: 'Accepted from evidence',
        source: 'pm_override',
      },
    ]);
  });

  it('leaves remainingDays* null when remainingDuration would throw', () => {
    const r = computeReview(
      gapInput({
        pinnedSnapshot: {
          ...input.pinnedSnapshot,
          tickets: [
            {
              ...input.pinnedSnapshot.tickets[0]!,
              statusId: 'Closed',
              estimateMh: hoursToMh(100),
            },
          ],
        },
        // Negative duration is invalid for remainingDuration — must not fail computeReview.
        durationDaysByWp: new Map([['WP-B', -1]]),
        recordedPctByWp: new Map([
          [
            'WP-B',
            {
              pct: { num: 10n, den: 100n },
              reason: null,
              source: 'plan_edit' as const,
            },
          ],
        ]),
      }),
    );
    const row = r.observedVsRecorded!.find((x) => x.wpId === 'WP-B');
    expect(row).toBeDefined();
    expect(row!.remainingDaysBefore).toBeNull();
    expect(row!.remainingDaysAfter).toBeNull();
  });
});
