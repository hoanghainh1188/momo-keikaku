import { ENGINE_VERSION } from '../../engine-version';
import { edge, inputs, wp } from '../fixtures';
import { out } from '../helpers';
import type { CorpusCase } from '../types';

/**
 * MFO −6 weeks — ASAP chain A→B→C (each 5 d) decides the finish; Z off-path has
 * must_finish_on Fri 11 Sep (~30 working days before C's Fri 23 Oct finish).
 *
 * A Mon5–Fri9; B Mon12–Fri16; C Mon19–Fri23. Z Mon5–Tue6. MFO miss: asked 11 Sep,
 * derived Tue6, daysLate = pos(Tue6) − pos(Fri11 Sep) = 17. Violation on Z only;
 * Float and criticalPath identical to the asap twin ([A,B,C] Float 0; Z Float 13).
 */
export const mfoSixWeeks: CorpusCase = {
  id: 'mfo-six-weeks',
  title: 'MFO −6 weeks',
  engineVersion: ENGINE_VERSION,
  note:
    'A→B→C each 5 d → finish Fri23. Z 2 d Mon5–Tue6, MFO Fri11 Sep → 17 wd late. ' +
    'Z violated; path [A,B,C]; every Float matches asap (Z Float 13 = Fri23−Tue6).',
  inputs: inputs(
    [
      wp('A', { durationDays: 5 }),
      wp('B', { durationDays: 5 }),
      wp('C', { durationDays: 5 }),
      wp('Z', {
        durationDays: 2,
        constraintType: 'must_finish_on',
        constraintDate: '2026-09-11',
      }),
    ],
    [edge('A', 'B'), edge('B', 'C')],
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
        askedDate: '2026-09-11',
        derivedDate: '2026-10-06',
        daysLate: 17,
        chain: [],
      },
    ],
    anchor: { kind: 'computed_finish', date: '2026-10-23' },
    computedFinish: '2026-10-23',
    criticalPath: ['A', 'B', 'C'],
  },
};
