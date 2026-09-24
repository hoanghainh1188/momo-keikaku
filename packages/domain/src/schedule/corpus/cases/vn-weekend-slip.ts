import { ENGINE_VERSION } from '../../engine-version';
import { edge, inputs, wp, CAL_VN } from '../fixtures';
import { out } from '../helpers';
import type { CorpusCase } from '../types';

/**
 * VN weekend slip ⟨Q3⟩ — same topology A(5)→B(3) on the VN calendar
 * (weekends + Tue 13 Oct holiday). The holiday falls inside B's run and shifts it.
 *
 * A Mon5–Fri9; B Mon12, Wed14, Thu15 (Tue13 skipped). Anchor Thu15; path [A,B].
 * Early dates differ from JP (A ends Mon12, B starts Tue13) where Wed 7 is the holiday.
 */
export const vnWeekendSlip: CorpusCase = {
  id: 'vn-weekend-slip',
  title: 'VN weekend slip ⟨Q3⟩',
  engineVersion: ENGINE_VERSION,
  note:
    'VN: Tue 13 Oct is non-working. A(5) Mon5–Fri9; B(3) Mon12,Wed14,Thu15. ' +
    'Without the holiday B would finish Tue13; the slip moves B\'s finish to Thu15. ' +
    'Differs from JP (A ends Mon12, B Tue13–Thu15).',
  inputs: inputs([wp('A', { durationDays: 5 }), wp('B', { durationDays: 3 })], [edge('A', 'B')], {
    calendar: CAL_VN,
  }),
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
        earlyFinish: '2026-10-15',
        remainingDays: 3,
        lateStart: '2026-10-12',
        lateFinish: '2026-10-15',
        floatDays: 0,
        isCritical: true,
        drivingPredecessors: ['A'],
      }),
    ],
    outOfSequence: [],
    notSchedulable: [],
    violations: [],
    anchor: { kind: 'computed_finish', date: '2026-10-15' },
    computedFinish: '2026-10-15',
    criticalPath: ['A', 'B'],
  },
};
