/**
 * Story 2.15 — plan write success / read-after-write refuse mapping.
 */
import { describe, expect, it } from 'vitest';
import type { PlanGridViewModel } from '@/components/plan-grid-types';
import { readAfterWriteRefuse, toPlanWriteSuccess } from './plan-write-success';

const sampleView: PlanGridViewModel = {
  projectId: 'prj-1',
  userId: 'user-1',
  dataDate: '2026-09-19',
  projectStart: '2026-03-02',
  projectFinish: null,
  computedFinish: '2027-03-26',
  minFloat: 4,
  floatAnchorSentence:
    'Float measured against the computed finish, 26 Mar 2027 — relative, because no Project finish is set',
  finishTeaching: 'This moves no work package.',
  noProjectStart: false,
  floatAnchorLabel: 'vs computed finish',
  scheduleStale: false,
  haltedReason: null,
  whatMoved: {
    runSeq: 2,
    movedCount: 1,
    nothingMoved: false,
    summaryLine: '1 work package moved · computed finish 12 Mar → 26 Mar 2027 · minimum Float +4 → +4',
    politeAnnounce: '1 work package moved. Computed finish 26 March 2027. Minimum Float plus 4.',
    previousComputedFinish: '2027-03-12',
    computedFinish: '2027-03-26',
    previousMinFloat: 4,
    minFloat: 4,
    groups: [
      {
        cause: 'edited',
        entries: [
          {
            wpId: 'wp-1',
            wbsCode: '1.1',
            name: 'Leaf',
            cause: 'edited',
            oldEarlyStart: '2026-10-01',
            oldEarlyFinish: '2026-10-05',
            newEarlyStart: '2026-10-08',
            newEarlyFinish: '2026-10-12',
          },
        ],
      },
    ],
    actorUserId: 'user-1',
    actorName: 'Hoang',
    atIso: '2026-09-26T10:00:00.000Z',
  },
  exceptions: {
    totalCount: 0,
    holidayCalendarVersionSeq: 3,
    calendarRangeStart: '2026-01-01',
    calendarRangeEnd: '2028-12-31',
    violations: [],
    outOfSequence: [],
    notSchedulable: [],
  },
  leafCandidates: [],
  rows: [],
};

describe('plan-write-success (story 2.15)', () => {
  it('returns re-read whatMoved and strip scalars on success', () => {
    const success = toPlanWriteSuccess(sampleView);
    expect(success.ok).toBe(true);
    expect(success.whatMoved?.runSeq).toBe(2);
    expect(success.whatMoved?.nothingMoved).toBe(false);
    expect(success.projectStart).toBe('2026-03-02');
    expect(success.computedFinish).toBe('2027-03-26');
    expect(success.minFloat).toBe(4);
    expect(success.floatAnchorSentence).toMatch(/Float measured against/);
    expect(success.exceptions.totalCount).toBe(0);
    expect(success.exceptions.holidayCalendarVersionSeq).toBe(3);
    expect(success).not.toHaveProperty('movedWpIds');
  });

  it('refuses with read_after_write instead of empty success when re-read fails', () => {
    const refuse = readAfterWriteRefuse();
    expect(refuse.ok).toBe(false);
    expect(refuse.code).toBe('read_after_write');
    expect(refuse.details?.refuse?.[0]).toMatch(/could not be re-read/);
  });

  it('preserves empty exceptions + calendar range on a halted re-read (story 2.16)', () => {
    const halted: PlanGridViewModel = {
      ...sampleView,
      scheduleStale: true,
      haltedReason: 'calendar_range',
      computedFinish: null,
      minFloat: null,
      floatAnchorSentence: null,
      whatMoved: null,
      exceptions: {
        totalCount: 0,
        holidayCalendarVersionSeq: null,
        calendarRangeStart: '2026-01-01',
        calendarRangeEnd: '2028-12-31',
        violations: [],
        outOfSequence: [],
        notSchedulable: [],
      },
    };
    const success = toPlanWriteSuccess(halted);
    expect(success.ok).toBe(true);
    expect(success.exceptions.totalCount).toBe(0);
    expect(success.exceptions.calendarRangeStart).toBe('2026-01-01');
    expect(success.scheduleStale).toBe(true);
    expect(success.haltedReason).toBe('calendar_range');
  });
});
