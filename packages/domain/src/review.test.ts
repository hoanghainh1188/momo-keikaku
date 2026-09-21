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
  start: '2026-06-01',
  finish: '2026-12-01',
  plannedMh: hoursToMh(200),
  completedAt: null,
  milestoneDoneAt: null,
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
      rates: [{ effectiveFrom: '2026-01-01', yenPerHour: 5000n }],
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
