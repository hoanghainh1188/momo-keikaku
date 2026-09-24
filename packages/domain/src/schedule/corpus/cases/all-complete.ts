import { ENGINE_VERSION } from '../../engine-version';
import { inputs, wp } from '../fixtures';
import { out } from '../helpers';
import type { CorpusCase } from '../types';

/**
 * All-complete ⟨2.6 Q7⟩ — every leaf complete; optional Project finish set.
 *
 * Computed finish is the latest early finish of a remaining or in-progress WP, so an
 * all-complete plan has computedFinish null. Complete WPs carry no Float, so the
 * critical path stays empty even when a Project finish anchors Float measurement.
 */
export const allComplete: CorpusCase = {
  id: 'all-complete',
  title: 'All-complete ⟨2.6 Q7⟩',
  engineVersion: ENGINE_VERSION,
  note:
    'A and B complete on actuals. Project finish Fri 30 Oct anchors; computedFinish null; ' +
    'criticalPath []; no late dates on complete leaves.',
  inputs: inputs(
    [
      wp('A', { durationDays: 2, actualStart: '2026-09-28', actualFinish: '2026-09-29' }),
      wp('B', { durationDays: 3, actualStart: '2026-09-30', actualFinish: '2026-10-02' }),
    ],
    [],
    { projectFinish: '2026-10-30' },
  ),
  expected: {
    wps: [
      out('A', {
        state: 'complete',
        earlyStart: '2026-09-28',
        earlyFinish: '2026-09-29',
        remainingDays: 0,
      }),
      out('B', {
        state: 'complete',
        earlyStart: '2026-09-30',
        earlyFinish: '2026-10-02',
        remainingDays: 0,
      }),
    ],
    outOfSequence: [],
    notSchedulable: [],
    violations: [],
    anchor: { kind: 'project_finish', date: '2026-10-30' },
    computedFinish: null,
    criticalPath: [],
  },
};
