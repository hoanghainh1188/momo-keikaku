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
  haltedReason: null,
  scheduleStale: false,
  floatAnchorLabel: 'vs computed finish',
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
};

describe('plan-grid-view (story 2.13)', () => {
  it('serialises BigInt recorded % and preserves schedule fields', () => {
    const view = toPlanGridViewModel(sample, 'user-1');
    expect(view.userId).toBe('user-1');
    expect(view.floatAnchorLabel).toBe('vs computed finish');
    expect(view.rows[0]!.recordedPct).toEqual({ num: '1', den: '4' });
    expect(view.rows[0]!.exceptionLabel).toBe('▲ Late 6d');
    expect(view.rows[0]!.floatDays).toBe(-3);
    expect(view.rows[0]!.isCritical).toBe(true);
    expect(view.rows[0]!.remainingDays).toBe(8);
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
  });

  it('maps Schedule default fields for the matrix (dates, float, critical, exception)', () => {
    const view = toPlanGridViewModel(sample, 'user-1');
    const leaf = view.rows[0]!;
    expect(leaf.earlyStart).toBe('2026-09-01');
    expect(leaf.earlyFinish).toBe('2026-10-01');
    expect(leaf.floatDays).toBe(-3);
    expect(leaf.isCritical).toBe(true);
    expect(leaf.exceptionLabel).toBe('▲ Late 6d');
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
});
