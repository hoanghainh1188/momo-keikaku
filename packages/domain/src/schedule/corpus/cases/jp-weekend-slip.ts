import { ENGINE_VERSION } from '../../engine-version';
import { edge, inputs, wp, CAL_JP } from '../fixtures';
import { out } from '../helpers';
import type { CorpusCase } from '../types';

/**
 * JP weekend slip ⟨Q3⟩ — A(3)→B(2) from Data Date Mon 5 Oct on the JP calendar
 * (weekends + Wed 7 Oct holiday).
 *
 * Working days from Mon 5: Mon5, Tue6, Thu8, Fri9, Mon12, …
 * A occupies Mon5–Thu8 (Wed7 skipped); B Fri9–Mon12.
 * Anchor = computed finish Mon12; both Float 0, critical path A→B.
 */
export const jpWeekendSlip: CorpusCase = {
  id: 'jp-weekend-slip',
  title: 'JP weekend slip ⟨Q3⟩',
  engineVersion: ENGINE_VERSION,
  note:
    'JP: Wed 7 Oct is non-working. A(3) Mon5,Tue6,Thu8; B(2) Fri9,Mon12. ' +
    'Late: B Fri9–Mon12 Float 0; A Mon5–Thu8 Float 0. Path [A,B].',
  inputs: inputs([wp('A', { durationDays: 3 }), wp('B', { durationDays: 2 })], [edge('A', 'B')], {
    calendar: CAL_JP,
  }),
  expected: {
    wps: [
      out('A', {
        state: 'remaining',
        earlyStart: '2026-10-05',
        earlyFinish: '2026-10-08',
        remainingDays: 3,
        lateStart: '2026-10-05',
        lateFinish: '2026-10-08',
        floatDays: 0,
        isCritical: true,
      }),
      out('B', {
        state: 'remaining',
        earlyStart: '2026-10-09',
        earlyFinish: '2026-10-12',
        remainingDays: 2,
        lateStart: '2026-10-09',
        lateFinish: '2026-10-12',
        floatDays: 0,
        isCritical: true,
        drivingPredecessors: ['A'],
      }),
    ],
    outOfSequence: [],
    notSchedulable: [],
    violations: [],
    anchor: { kind: 'computed_finish', date: '2026-10-12' },
    computedFinish: '2026-10-12',
    criticalPath: ['A', 'B'],
  },
};
