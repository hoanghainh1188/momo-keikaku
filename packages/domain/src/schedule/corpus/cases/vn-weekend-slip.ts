import { ENGINE_VERSION } from '../../engine-version';
import { edge, inputs, wp, CAL_VN } from '../fixtures';
import { out } from '../helpers';
import type { CorpusCase } from '../types';

/**
 * VN weekend slip ⟨Q3⟩ — same topology as the JP case on the VN calendar
 * (weekends + Tue 13 Oct holiday). The short chain ends before Tue 13, so dates
 * match a weekends-only calendar and differ from JP where Wed 7 slipped A/B.
 *
 * A Mon5–Wed7; B Thu8–Fri9. Anchor Fri9; path [A,B].
 */
export const vnWeekendSlip: CorpusCase = {
  id: 'vn-weekend-slip',
  title: 'VN weekend slip ⟨Q3⟩',
  engineVersion: ENGINE_VERSION,
  note:
    'VN: Tue 13 Oct is non-working (after this chain). A(3) Mon5–Wed7; B(2) Thu8–Fri9. ' +
    'Differs from JP (A ends Thu8, B ends Mon12) where Wed 7 is the holiday.',
  inputs: inputs([wp('A', { durationDays: 3 }), wp('B', { durationDays: 2 })], [edge('A', 'B')], {
    calendar: CAL_VN,
  }),
  expected: {
    wps: [
      out('A', {
        state: 'remaining',
        earlyStart: '2026-10-05',
        earlyFinish: '2026-10-07',
        remainingDays: 3,
        lateStart: '2026-10-05',
        lateFinish: '2026-10-07',
        floatDays: 0,
        isCritical: true,
      }),
      out('B', {
        state: 'remaining',
        earlyStart: '2026-10-08',
        earlyFinish: '2026-10-09',
        remainingDays: 2,
        lateStart: '2026-10-08',
        lateFinish: '2026-10-09',
        floatDays: 0,
        isCritical: true,
        drivingPredecessors: ['A'],
      }),
    ],
    outOfSequence: [],
    notSchedulable: [],
    violations: [],
    anchor: { kind: 'computed_finish', date: '2026-10-09' },
    computedFinish: '2026-10-09',
    criticalPath: ['A', 'B'],
  },
};
