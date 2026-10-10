/**
 * `formulaVersion` registry (story 6.1, AR-19 / AD-10).
 *
 * Like `engine_version` for the scheduler: every registered key stays executable. Changing any
 * formula adds a new key; historical goldens keep theirs and still recompute. The current key
 * lives in `evm.ts` (`FORMULA_VERSION`); this module is the dispatch map CI and capture use.
 */
import { FORMULA_VERSION } from './evm';
import { computeReview, type ReviewInput, type ReviewResult } from './review';

/** One pure Review compute under a registered `formulaVersion`. */
export type FormulaCompute = (inputs: ReviewInput) => ReviewResult;

const REGISTRY: Readonly<Record<string, FormulaCompute>> = {
  [FORMULA_VERSION]: computeReview,
};

/** Every registered `formulaVersion`, in registration order. */
export function registeredFormulaVersions(): readonly string[] {
  return Object.keys(REGISTRY);
}

/** The compute for `formulaVersion`, or a throw naming the unknown key. */
export function formulaAt(formulaVersion: string): FormulaCompute {
  const compute = REGISTRY[formulaVersion];
  if (compute === undefined) {
    throw new RangeError(`unknown formulaVersion "${formulaVersion}"`);
  }
  return (inputs) => {
    if (inputs.formulaVersion != null && inputs.formulaVersion !== formulaVersion) {
      throw new RangeError(
        `formulaVersion mismatch: requested "${formulaVersion}", inputs carry "${inputs.formulaVersion}"`,
      );
    }
    return compute(inputs);
  };
}

/** `computeReview` under a recorded `formulaVersion` (AD-10 golden recompute dispatch). */
export function computeAt(formulaVersion: string, inputs: ReviewInput): ReviewResult {
  return formulaAt(formulaVersion)(inputs);
}
