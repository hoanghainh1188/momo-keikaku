import { allComplete } from './cases/all-complete';
import { anchorCap } from './cases/anchor-cap';
import { jpWeekendSlip } from './cases/jp-weekend-slip';
import { midFlight } from './cases/mid-flight';
import { milestone } from './cases/milestone';
import { mfoSixWeeks } from './cases/mfo-six-weeks';
import { negativeFloat } from './cases/negative-float';
import { noDuration } from './cases/no-duration';
import { outOfSequence } from './cases/out-of-sequence';
import { vnWeekendSlip } from './cases/vn-weekend-slip';
/**
 * The golden scheduler corpus (story 2.8 / AR-35): every I/O-matrix row, hand-computed.
 * Expectations are deliberate product pins — never regenerated to silence a failing suite.
 */
export const CORPUS = [
    jpWeekendSlip,
    vnWeekendSlip,
    midFlight,
    negativeFloat,
    outOfSequence,
    mfoSixWeeks,
    milestone,
    noDuration,
    anchorCap,
    allComplete,
];
