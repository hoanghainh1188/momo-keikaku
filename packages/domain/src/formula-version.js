/**
 * `formulaVersion` registry (story 6.1, AR-19 / AD-10).
 *
 * Like `engine_version` for the scheduler: every registered key stays executable. Changing any
 * formula adds a new key; historical goldens keep theirs and still recompute. The current key
 * lives in `evm.ts` (`FORMULA_VERSION`); this module is the dispatch map CI and capture use.
 */
import { FORMULA_VERSION, LEGACY_FORMULA_VERSION, PRIOR_FORMULA_VERSION } from './evm';
import { computeReview } from './review';
function bindVersion(version) {
    return (inputs) => computeReview({ ...inputs, formulaVersion: version });
}
const REGISTRY = {
    // Legacy half-even PV (story 6.1 goldens) — must stay executable after the 6.2 bump.
    [LEGACY_FORMULA_VERSION]: bindVersion(LEGACY_FORMULA_VERSION),
    // Story 6.2–6.4 key — kept executable after the 6.5 Health bump (Q3-A).
    [PRIOR_FORMULA_VERSION]: bindVersion(PRIOR_FORMULA_VERSION),
    [FORMULA_VERSION]: bindVersion(FORMULA_VERSION),
};
/** Every registered `formulaVersion`, in registration order. */
export function registeredFormulaVersions() {
    return Object.keys(REGISTRY);
}
/** The compute for `formulaVersion`, or a throw naming the unknown key. */
export function formulaAt(formulaVersion) {
    const compute = REGISTRY[formulaVersion];
    if (compute === undefined) {
        throw new RangeError(`unknown formulaVersion "${formulaVersion}"`);
    }
    return (inputs) => {
        if (inputs.formulaVersion != null && inputs.formulaVersion !== formulaVersion) {
            throw new RangeError(`formulaVersion mismatch: requested "${formulaVersion}", inputs carry "${inputs.formulaVersion}"`);
        }
        return compute(inputs);
    };
}
/** `computeReview` under a recorded `formulaVersion` (AD-10 golden recompute dispatch). */
export function computeAt(formulaVersion, inputs) {
    return formulaAt(formulaVersion)(inputs);
}
