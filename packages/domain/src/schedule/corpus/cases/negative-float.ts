import { ENGINE_VERSION } from '../../engine-version';
import { edge, inputs, wp } from '../fixtures';
import { out } from '../helpers';
import type { CorpusCase } from '../types';

/**
 * Negative Float — PM-set Project finish Tue 6 Oct, three working days before the
 * computed finish Fri 9. Chain A(3)→B(2); C(1) off-path.
 *
 * A Mon5–Wed7; B Thu8–Fri9; C Mon5. Against Project finish Tue6:
 * B late Mon5–Tue6 Float −3; A late Wed 30 Sep – Fri 2 Oct Float −3; C late Tue6 Float 1.
 * Critical path = min-Float set [A,B].
 */
export const negativeFloat: CorpusCase = {
  id: 'negative-float',
  title: 'Negative Float',
  engineVersion: ENGINE_VERSION,
  note:
    'Project finish Tue6; computed finish Fri9. A→B critical at Float −3; C Float 1. ' +
    'Early dates unchanged by the anchor.',
  inputs: inputs(
    [wp('A', { durationDays: 3 }), wp('B', { durationDays: 2 }), wp('C', { durationDays: 1 })],
    [edge('A', 'B')],
    { projectFinish: '2026-10-06' },
  ),
  expected: {
    wps: [
      out('A', {
        state: 'remaining',
        earlyStart: '2026-10-05',
        earlyFinish: '2026-10-07',
        remainingDays: 3,
        lateStart: '2026-09-30',
        lateFinish: '2026-10-02',
        floatDays: -3,
        isCritical: true,
      }),
      out('B', {
        state: 'remaining',
        earlyStart: '2026-10-08',
        earlyFinish: '2026-10-09',
        remainingDays: 2,
        lateStart: '2026-10-05',
        lateFinish: '2026-10-06',
        floatDays: -3,
        isCritical: true,
        drivingPredecessors: ['A'],
      }),
      out('C', {
        state: 'remaining',
        earlyStart: '2026-10-05',
        earlyFinish: '2026-10-05',
        remainingDays: 1,
        lateStart: '2026-10-06',
        lateFinish: '2026-10-06',
        floatDays: 1,
      }),
    ],
    outOfSequence: [],
    notSchedulable: [],
    violations: [],
    anchor: { kind: 'project_finish', date: '2026-10-06' },
    computedFinish: '2026-10-09',
    criticalPath: ['A', 'B'],
  },
};
