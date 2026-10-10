import { ENGINE_VERSION } from '../../engine-version';
import { edge, inputs, wp } from '../fixtures';
import { out } from '../helpers';
/**
 * Anchor cap ⟨2.6 Q6⟩ — strongly negative lag that would push late finish past the anchor.
 *
 * W(5) Mon5–Fri9 →(−3) S(1) driven to Wed7. Without the cap, W's late finish from S
 * would be Tue13 (past the computed finish Fri9). Cap holds W at Fri9, Float 0;
 * S late Fri9 Float 2; min Float 0; path [W].
 */
export const anchorCap = {
    id: 'anchor-cap',
    title: 'Anchor cap ⟨2.6 Q6⟩',
    engineVersion: ENGINE_VERSION,
    note: 'W Mon5–Fri9 →(−3) S Wed7. S late Fri9 Float 2. W capped at Fri9 Float 0 ' +
        '(uncapped would late-finish Tue13). Path [W]; no Project finish.',
    inputs: inputs([wp('W', { durationDays: 5 }), wp('S')], [edge('W', 'S', -3)]),
    expected: {
        // compareWp order by WBS (= id): S before W.
        wps: [
            out('S', {
                state: 'remaining',
                earlyStart: '2026-10-07',
                earlyFinish: '2026-10-07',
                remainingDays: 1,
                lateStart: '2026-10-09',
                lateFinish: '2026-10-09',
                floatDays: 2,
                drivingPredecessors: ['W'],
            }),
            out('W', {
                state: 'remaining',
                earlyStart: '2026-10-05',
                earlyFinish: '2026-10-09',
                remainingDays: 5,
                lateStart: '2026-10-05',
                lateFinish: '2026-10-09',
                floatDays: 0,
                isCritical: true,
            }),
        ],
        outOfSequence: [],
        notSchedulable: [],
        violations: [],
        anchor: { kind: 'computed_finish', date: '2026-10-09' },
        computedFinish: '2026-10-09',
        criticalPath: ['W'],
    },
};
