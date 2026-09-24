import { ENGINE_VERSION } from '../../engine-version';
import { edge, inputs, wp, CAL_JP } from '../fixtures';
import { out } from '../helpers';
import type { CorpusCase } from '../types';

/**
 * JP weekend slip ⟨Q3⟩ — A(5)→B(3) from Data Date Mon 5 Oct on the JP calendar
 * (weekends + Wed 7 Oct holiday). Same topology as the VN case.
 *
 * Working days from Mon 5: Mon5, Tue6, Thu8, Fri9, Mon12, Tue13, …
 * A occupies Mon5–Mon12 (Wed7 skipped); B Tue13–Thu15.
 * Anchor = computed finish Thu15; both Float 0, critical path A→B.
 */
export const jpWeekendSlip: CorpusCase = {
  id: 'jp-weekend-slip',
  title: 'JP weekend slip ⟨Q3⟩',
  engineVersion: ENGINE_VERSION,
  note:
    'JP: Wed 7 Oct is non-working. A(5) Mon5,Tue6,Thu8,Fri9,Mon12; B(3) Tue13–Thu15. ' +
    'Late: both Float 0. Path [A,B]. Differs from VN where A ends Fri9 and B starts Mon12.',
  inputs: inputs([wp('A', { durationDays: 5 }), wp('B', { durationDays: 3 })], [edge('A', 'B')], {
    calendar: CAL_JP,
  }),
  expected: {
    wps: [
      out('A', {
        state: 'remaining',
        earlyStart: '2026-10-05',
        earlyFinish: '2026-10-12',
        remainingDays: 5,
        lateStart: '2026-10-05',
        lateFinish: '2026-10-12',
        floatDays: 0,
        isCritical: true,
      }),
      out('B', {
        state: 'remaining',
        earlyStart: '2026-10-13',
        earlyFinish: '2026-10-15',
        remainingDays: 3,
        lateStart: '2026-10-13',
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
