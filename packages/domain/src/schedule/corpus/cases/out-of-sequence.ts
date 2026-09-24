import { ENGINE_VERSION } from '../../engine-version';
import { edge, inputs, wp } from '../fixtures';
import { out } from '../helpers';
import type { CorpusCase } from '../types';

/**
 * Out-of-sequence — actual start before a predecessor's drive.
 *
 * P (5 d) remaining Mon5–Fri9. S started Thu 1 Oct (before P's drive Mon5), resumes
 * Mon5 for 3 days → EF Wed7. Actuals kept; outOfSequence names P→S; successors would
 * drive from actuals (none here). P does not take a late bound from in-progress S.
 * Anchor Fri9; P critical Float 0; S late Wed7–Fri9 Float 2 from resume Mon5.
 */
export const outOfSequence: CorpusCase = {
  id: 'out-of-sequence',
  title: 'Out-of-sequence',
  engineVersion: ENGINE_VERSION,
  note:
    'P Mon5–Fri9; S actualStart Thu1, remaining 3 → Mon5–Wed7. OOS [P→S]. ' +
    'P late at anchor Fri9 Float 0 (S in-progress does not bound it); S Float 2.',
  inputs: inputs(
    [wp('P', { durationDays: 5 }), wp('S', { durationDays: 3, actualStart: '2026-10-01' })],
    [edge('P', 'S')],
  ),
  expected: {
    wps: [
      out('P', {
        state: 'remaining',
        earlyStart: '2026-10-05',
        earlyFinish: '2026-10-09',
        remainingDays: 5,
        lateStart: '2026-10-05',
        lateFinish: '2026-10-09',
        floatDays: 0,
        isCritical: true,
      }),
      out('S', {
        state: 'in_progress',
        earlyStart: '2026-10-01',
        earlyFinish: '2026-10-07',
        remainingDays: 3,
        lateStart: '2026-10-07',
        lateFinish: '2026-10-09',
        floatDays: 2,
      }),
    ],
    outOfSequence: [{ predecessorId: 'P', successorId: 'S' }],
    notSchedulable: [],
    violations: [],
    anchor: { kind: 'computed_finish', date: '2026-10-09' },
    computedFinish: '2026-10-09',
    criticalPath: ['P'],
  },
};
