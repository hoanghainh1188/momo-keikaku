import { ENGINE_VERSION } from '../../engine-version';
import { calendar, edge, inputs, wp } from '../fixtures';
import { out } from '../helpers';
import type { CorpusCase } from '../types';

/**
 * MFO −6 weeks — ASAP chain A→B→C (each 5 d) decides the finish; Z off-path has
 * must_finish_on Tue 25 Aug (30 working days before Z's derived finish Tue 6 Oct).
 *
 * Calendar opens 1 Aug so the asked date stays in range. A Mon5–Fri9; B Mon12–Fri16;
 * C Mon19–Fri23. Z Mon5–Tue6. MFO miss: asked 25 Aug, derived Tue6, daysLate = 30.
 * Violation on Z only; Float and criticalPath identical to the asap twin
 * ([A,B,C] Float 0; Z Float 13).
 */
export const mfoSixWeeks: CorpusCase = {
  id: 'mfo-six-weeks',
  title: 'MFO −6 weeks',
  engineVersion: ENGINE_VERSION,
  note:
    'A→B→C each 5 d → finish Fri23. Z 2 d Mon5–Tue6, MFO Tue25 Aug → 30 wd late ' +
    '(six weeks before Z\'s derived finish; calendar from 1 Aug). ' +
    'Z violated; path [A,B,C]; every Float matches asap (Z Float 13).',
  inputs: inputs(
    [
      wp('A', { durationDays: 5 }),
      wp('B', { durationDays: 5 }),
      wp('C', { durationDays: 5 }),
      wp('Z', {
        durationDays: 2,
        constraintType: 'must_finish_on',
        constraintDate: '2026-08-25',
      }),
    ],
    [edge('A', 'B'), edge('B', 'C')],
    { calendar: calendar('2026-08-01', '2027-12-31') },
  ),
  expected: {
    wps: [
      out('A', {
        state: 'remaining',
        earlyStart: '2026-10-05',
        earlyFinish: '2026-10-09',
        remainingDays: 5,
        lateStart: '2026-10-05',
        lateFinish: '2026-10-09',
        floatDays: 0,
        isCritical: true,
      }),
      out('B', {
        state: 'remaining',
        earlyStart: '2026-10-12',
        earlyFinish: '2026-10-16',
        remainingDays: 5,
        lateStart: '2026-10-12',
        lateFinish: '2026-10-16',
        floatDays: 0,
        isCritical: true,
        drivingPredecessors: ['A'],
      }),
      out('C', {
        state: 'remaining',
        earlyStart: '2026-10-19',
        earlyFinish: '2026-10-23',
        remainingDays: 5,
        lateStart: '2026-10-19',
        lateFinish: '2026-10-23',
        floatDays: 0,
        isCritical: true,
        drivingPredecessors: ['B'],
      }),
      out('Z', {
        state: 'remaining',
        earlyStart: '2026-10-05',
        earlyFinish: '2026-10-06',
        remainingDays: 2,
        lateStart: '2026-10-22',
        lateFinish: '2026-10-23',
        floatDays: 13,
      }),
    ],
    outOfSequence: [],
    notSchedulable: [],
    violations: [
      {
        wpId: 'Z',
        constraintType: 'must_finish_on',
        askedDate: '2026-08-25',
        derivedDate: '2026-10-06',
        daysLate: 30,
        chain: [],
      },
    ],
    anchor: { kind: 'computed_finish', date: '2026-10-23' },
    computedFinish: '2026-10-23',
    criticalPath: ['A', 'B', 'C'],
  },
};
