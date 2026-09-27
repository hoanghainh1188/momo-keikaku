/**
 * Story 2.13 — view-model mapping + column/slot contract (no JSX; vitest is node + jsx preserve).
 */
import { describe, expect, it } from 'vitest';
import type { PlanGridState } from '@momo/app';
import {
  PLAN_GRID_SLOTS,
  PROGRESS_ABSENT,
  PROGRESS_COLUMNS,
  SCHEDULE_COLUMNS,
  toPlanGridViewModel,
} from './plan-grid-view';

const sample: PlanGridState = {
  projectId: 'prj-1',
  projectStart: '2026-03-02',
  projectFinish: null,
  dataDate: '2026-09-19',
  tzOffsetMinutes: 540,
  anchor: { kind: 'computed_finish', date: '2027-03-26' },
  computedFinish: '2027-03-26',
  minFloat: 4,
  floatAnchorSentence:
    'Float measured against the computed finish, 26 Mar 2027 — relative, because no Project finish is set',
  haltedReason: null,
  scheduleStale: false,
  floatAnchorLabel: 'vs computed finish',
  finishTeaching:
    'This moves no work package. It changes what Float is measured against, and lets Float go negative',
  whatMoved: null,
  exceptions: {
    totalCount: 0,
    holidayCalendarVersionSeq: null,
    calendarRangeStart: null,
    calendarRangeEnd: null,
    violations: [],
    outOfSequence: [],
    notSchedulable: [],
  },
  rows: [
    {
      wpId: 'leaf',
      wbsCode: '1.1',
      name: 'Leaf',
      parentId: null,
      isLeaf: true,
      isMilestone: false,
      isCatchAll: false,
      level: 1,
      posInSet: 1,
      setSize: 1,
      hasChildren: false,
      durationDays: 10,
      constraintType: 'asap',
      constraintDate: null,
      constraintLabel: 'As soon as possible',
      predecessorsText: '',
      predecessorEdges: [],
      earlyStart: '2026-09-01',
      earlyFinish: '2026-10-01',
      floatDays: -3,
      isCritical: true,
      state: 'remaining',
      notSchedulable: false,
      stale: false,
      actualStart: null,
      actualFinish: null,
      recordedPct: { num: 1n, den: 4n },
      remainingDays: 8,
      exception: { kind: 'violation', label: '▲ Late 6d', daysLate: 6 },
    },
  ],
  leafCandidates: [{ wpId: 'leaf', wbsCode: '1.1', name: 'Leaf' }],
};

describe('plan-grid-view (story 2.13)', () => {
  it('serialises BigInt recorded % and preserves schedule fields', () => {
    const view = toPlanGridViewModel(sample, 'user-1');
    expect(view.userId).toBe('user-1');
    expect(view.floatAnchorLabel).toBe('vs computed finish');
    expect(view.floatAnchorSentence).toMatch(/Float measured against the computed finish/);
    expect(view.minFloat).toBe(4);
    expect(view.projectFinish).toBeNull();
    expect(view.whatMoved).toBeNull();
    expect(view.rows[0]!.recordedPct).toEqual({ num: '1', den: '4' });
    expect(view.rows[0]!.exceptionLabel).toBe('▲ Late 6d');
    expect(view.rows[0]!.floatDays).toBe(-3);
    expect(view.rows[0]!.isCritical).toBe(true);
    expect(view.rows[0]!.remainingDays).toBe(8);
    expect(view.rows[0]!.constraintType).toBe('asap');
    expect(view.leafCandidates).toEqual([{ wpId: 'leaf', wbsCode: '1.1', name: 'Leaf' }]);
  });

  it('names UX-DR2 slots and Schedule/Progress column sets (Q4→A)', () => {
    expect(PLAN_GRID_SLOTS).toEqual([
      'schedule-strip-slot',
      'plan-toolbar',
      'what-moved-slot',
      'plan-tree',
      'exceptions-rail-slot',
    ]);
    expect(SCHEDULE_COLUMNS).toContain('Recorded %');
    expect(SCHEDULE_COLUMNS).toContain('Float');
    expect(PROGRESS_COLUMNS).toEqual([
      'Actual start',
      'Actual finish',
      'Recorded %',
      'Remaining',
    ]);
    for (const absent of PROGRESS_ABSENT) {
      expect(PROGRESS_COLUMNS).not.toContain(absent);
      expect(SCHEDULE_COLUMNS).not.toContain(absent);
    }
    // PlanTreeGrid imports these constants for headers + slot testids (story 2.13 review).
    expect(PLAN_GRID_SLOTS.length).toBe(5);
    expect(SCHEDULE_COLUMNS.length).toBe(9);
  });

  it('maps Schedule default fields for the matrix (dates, float, critical, exception)', () => {
    const view = toPlanGridViewModel(sample, 'user-1');
    const leaf = view.rows[0]!;
    expect(leaf.earlyStart).toBe('2026-09-01');
    expect(leaf.earlyFinish).toBe('2026-10-01');
    expect(leaf.floatDays).toBe(-3);
    expect(leaf.isCritical).toBe(true);
    expect(leaf.exceptionLabel).toBe('▲ Late 6d');
    expect(view.exceptions.totalCount).toBe(0);
    expect([...SCHEDULE_COLUMNS]).toEqual([
      'Start',
      'Finish',
      'Dur',
      'Predecessors',
      'Constraint',
      'Float',
      'Critical',
      'Exception',
      'Recorded %',
    ]);
  });

  it('serialises the exceptions rail lists for the client (story 2.16)', () => {
    const withRail: PlanGridState = {
      ...sample,
      exceptions: {
        totalCount: 3,
        holidayCalendarVersionSeq: 3,
        calendarRangeStart: '2026-01-01',
        calendarRangeEnd: '2028-12-31',
        violations: [
          {
            wpId: 'leaf',
            wbsCode: '1.1',
            name: 'Leaf',
            label: '▲ Late 6d',
            isMilestone: false,
            constraintType: 'must_finish_on',
            askedDate: '2027-03-18',
            derivedDate: '2027-03-26',
            daysLate: 6,
            chain: [
              {
                wpId: 'pred',
                wbsCode: '1.0',
                name: 'Pred',
                finish: '2027-03-20',
                lagDays: 2,
                presentInLiveTree: true,
              },
            ],
          },
        ],
        outOfSequence: [
          {
            predecessorWpId: 'pred',
            successorWpId: 'leaf',
            predecessorWbsCode: '1.0',
            predecessorName: 'Pred',
            successorWbsCode: '1.1',
            successorName: 'Leaf',
            label: '◇ Out of sequence',
            successorActualStart: '2026-09-12',
            predecessorFinish: '2026-09-20',
            predecessorPresent: true,
            successorPresent: true,
          },
        ],
        notSchedulable: [
          {
            wpId: 'ns',
            wbsCode: '1.2',
            name: 'No dur',
            label: '⊘ No duration',
            reason: 'no_duration',
          },
        ],
      },
    };
    const view = toPlanGridViewModel(withRail, 'user-1');
    expect(view.exceptions.totalCount).toBe(3);
    expect(view.exceptions.calendarRangeStart).toBe('2026-01-01');
    expect(view.exceptions.calendarRangeEnd).toBe('2028-12-31');
    expect(view.exceptions.violations[0]!.daysLate).toBe(6);
    expect(view.exceptions.violations[0]!.chain[0]!.lagDays).toBe(2);
    expect(view.exceptions.outOfSequence[0]!.successorActualStart).toBe('2026-09-12');
    expect(view.exceptions.outOfSequence[0]!.predecessorFinish).toBe('2026-09-20');
    expect(view.exceptions.notSchedulable[0]!.label).toBe('⊘ No duration');
    expect(view.exceptions.holidayCalendarVersionSeq).toBe(3);
  });
});
