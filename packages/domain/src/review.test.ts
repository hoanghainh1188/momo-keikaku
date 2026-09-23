import { describe, expect, it } from 'vitest';
import { periodOf } from './calendar';
import { computeReview, type ReviewInput } from './review';
import { DEFAULT_THRESHOLDS, type WorkPackage } from './types';
import { hoursToMh } from './units';

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
      wps: [
        { wpId: 'WP-B', start: '2026-06-01', finish: '2026-12-01', baselineMh: hoursToMh(200), isMilestone: false },
      ],
    },
  ],
  activeBaselineSeq: 1,
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
    tickets: [
      {
        trackerIssueId: 'tb',
        key: 'tb',
        title: 'tb',
        statusId: 'Open',
        resolved: false,
        estimateMh: null,
        actualMh: hoursToMh(30),
        assigneeAccountId: 'acct-1',
        issueTypeId: 'Task',
        categoryIds: [],
        milestoneIds: [],
        createdAt: '2026-06-01T00:00:00.000Z',
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
  });

  it('still throws for a Baseline seq that names no version — an inconsistent input, not a missing Baseline', () => {
    expect(() => computeReview({ ...noBaseline, activeBaselineSeq: 7 })).toThrow(
      'no baseline version with seq 7',
    );
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
          { wpId: 'WP-M', start: '2026-09-01', finish: '2026-09-01', baselineMh: 0n, isMilestone: true },
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
