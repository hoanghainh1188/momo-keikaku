import { ENGINE_VERSION } from '../../engine-version';
import { edge, inputs, wp } from '../fixtures';
import { out } from '../helpers';
import type { CorpusCase } from '../types';

/**
 * Mid-flight — complete + in-progress + remaining vs Data Date Mon 5 Oct.
 *
 * Done: actuals Mon 28 Sep – Fri 2 Oct (complete). Drives Rest at Mon 5.
 * Prog: started Mon 28 Sep, duration 4, no pct → 4 days left; resumes Mon 5, EF Thu 8.
 * Rest: remaining 2 d, Mon 5 – Tue 6, driven by Done.
 * Computed finish Thu 8; Prog critical (Float 0); Rest Float 2 (late Wed 7 – Thu 8).
 */
export const midFlight: CorpusCase = {
  id: 'mid-flight',
  title: 'Mid-flight',
  engineVersion: ENGINE_VERSION,
  note:
    'Done complete Fri 2 → Rest Mon5–Tue6. Prog resumes Mon5–Thu8 (4 left). ' +
    'Anchor Thu8; Prog Float 0 critical; Rest late Wed7–Thu8 Float 2; Done no late dates.',
  inputs: inputs(
    [
      wp('Done', { durationDays: 5, actualStart: '2026-09-28', actualFinish: '2026-10-02' }),
      wp('Prog', { durationDays: 4, actualStart: '2026-09-28' }),
      wp('Rest', { durationDays: 2 }),
    ],
    [edge('Done', 'Rest')],
  ),
  expected: {
    wps: [
      out('Done', {
        state: 'complete',
        earlyStart: '2026-09-28',
        earlyFinish: '2026-10-02',
        remainingDays: 0,
      }),
      out('Prog', {
        state: 'in_progress',
        earlyStart: '2026-09-28',
        earlyFinish: '2026-10-08',
        remainingDays: 4,
        lateStart: '2026-10-05',
        lateFinish: '2026-10-08',
        floatDays: 0,
        isCritical: true,
      }),
      out('Rest', {
        state: 'remaining',
        earlyStart: '2026-10-05',
        earlyFinish: '2026-10-06',
        remainingDays: 2,
        lateStart: '2026-10-07',
        lateFinish: '2026-10-08',
        floatDays: 2,
        drivingPredecessors: ['Done'],
      }),
    ],
    outOfSequence: [],
    notSchedulable: [],
    violations: [],
    anchor: { kind: 'computed_finish', date: '2026-10-08' },
    computedFinish: '2026-10-08',
    criticalPath: ['Prog'],
  },
};
