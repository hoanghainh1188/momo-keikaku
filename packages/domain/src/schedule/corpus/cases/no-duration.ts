import { ENGINE_VERSION } from '../../engine-version';
import { edge, inputs, wp } from '../fixtures';
import { out } from '../helpers';
import type { CorpusCase } from '../types';

/**
 * No duration — leaf with durationDays null. In notSchedulable; successors bridged;
 * no dates on that leaf.
 *
 * P(1) Mon5 →(1) X(null) →(2) S(1): S starts (1+1)+(1+2)−1 = 4 working days after Mon5
 * → Fri9. X has no early/late dates. Anchor Fri9; P and S Float 0 critical.
 */
export const noDuration: CorpusCase = {
  id: 'no-duration',
  title: 'No duration',
  engineVersion: ENGINE_VERSION,
  note:
    'P Mon5 →(1) X →(2) S Fri9 (bridged as P→(3) S). X notSchedulable, null dates. ' +
    'Path [P,S]; X late null.',
  inputs: inputs(
    [wp('P', { durationDays: 1 }), wp('S', { durationDays: 1 }), wp('X', { durationDays: null })],
    [edge('P', 'X', 1), edge('X', 'S', 2)],
  ),
  expected: {
    wps: [
      out('P', {
        state: 'remaining',
        earlyStart: '2026-10-05',
        earlyFinish: '2026-10-05',
        remainingDays: 1,
        lateStart: '2026-10-05',
        lateFinish: '2026-10-05',
        floatDays: 0,
        isCritical: true,
      }),
      out('S', {
        state: 'remaining',
        earlyStart: '2026-10-09',
        earlyFinish: '2026-10-09',
        remainingDays: 1,
        lateStart: '2026-10-09',
        lateFinish: '2026-10-09',
        floatDays: 0,
        isCritical: true,
        drivingPredecessors: ['P'],
      }),
      out('X', {
        state: 'remaining',
        earlyStart: null,
        earlyFinish: null,
        remainingDays: null,
        notSchedulableReason: 'no_duration',
      }),
    ],
    outOfSequence: [],
    notSchedulable: [{ wpId: 'X', reason: 'no_duration' }],
    violations: [],
    anchor: { kind: 'computed_finish', date: '2026-10-09' },
    computedFinish: '2026-10-09',
    criticalPath: ['P', 'S'],
  },
};
