import { ENGINE_VERSION } from '../../engine-version';
import { edge, inputs, wp } from '../fixtures';
import { out } from '../helpers';
/**
 * Milestone — zero-duration remaining leaf with must_finish_on.
 *
 * P(3) Mon5–Wed7 → M starts Thu8 (= finish). MFO Wed7 missed by 1 working day.
 * M participates in both passes (Float 0 with P; critical). Violation on M.
 */
export const milestone = {
    id: 'milestone',
    title: 'Milestone',
    engineVersion: ENGINE_VERSION,
    note: 'P Mon5–Wed7 → M Thu8. MFO Wed7 → daysLate 1, chain [P]. ' +
        'M late Thu8 Float 0; path [P,M]; computed finish Thu8.',
    inputs: inputs([
        wp('P', { durationDays: 3 }),
        wp('M', {
            durationDays: 0,
            constraintType: 'must_finish_on',
            constraintDate: '2026-10-07',
        }),
    ], [edge('P', 'M')]),
    expected: {
        // compareWp order by WBS (= id): M before P.
        wps: [
            out('M', {
                state: 'remaining',
                earlyStart: '2026-10-08',
                earlyFinish: '2026-10-08',
                remainingDays: 0,
                lateStart: '2026-10-08',
                lateFinish: '2026-10-08',
                floatDays: 0,
                isCritical: true,
                drivingPredecessors: ['P'],
            }),
            out('P', {
                state: 'remaining',
                earlyStart: '2026-10-05',
                earlyFinish: '2026-10-07',
                remainingDays: 3,
                lateStart: '2026-10-05',
                lateFinish: '2026-10-07',
                floatDays: 0,
                isCritical: true,
            }),
        ],
        outOfSequence: [],
        notSchedulable: [],
        violations: [
            {
                wpId: 'M',
                constraintType: 'must_finish_on',
                askedDate: '2026-10-07',
                derivedDate: '2026-10-08',
                daysLate: 1,
                chain: ['P'],
            },
        ],
        anchor: { kind: 'computed_finish', date: '2026-10-08' },
        computedFinish: '2026-10-08',
        criticalPath: ['P', 'M'],
    },
};
