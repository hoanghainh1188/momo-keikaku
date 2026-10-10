/**
 * `engine_version` registry (story 2.8, AR-51 / AD-26).
 *
 * Like `FORMULA_VERSION` for EVM, every registered key stays executable. A change to the
 * passes, the roll-up, the ordering or the cause derivation registers a new key; historical
 * goldens keep theirs and still re-derive. The stored `schedule_run.engine_version` column is
 * written by story 2.9; this module is the domain map CI dispatches on.
 */
import { recalculate, } from './recalculate';
/** The engine that produces the story 2.5–2.7 dates pinned by the golden corpus. */
export const ENGINE_VERSION = 'schedule-2026-09-24';
const REGISTRY = {
    [ENGINE_VERSION]: recalculate,
};
/** Every registered `engine_version`, in registration order. */
export function registeredEngineVersions() {
    return Object.keys(REGISTRY);
}
/** The engine for `engineVersion`, or a throw naming the unknown key. */
export function engineAt(engineVersion) {
    const engine = REGISTRY[engineVersion];
    if (engine === undefined) {
        throw new RangeError(`unknown engine_version "${engineVersion}"`);
    }
    return engine;
}
/** `recalculate` under a recorded `engine_version` (AR-51's re-derivation dispatch). */
export function recalculateAt(engineVersion, inputs, prevInputs) {
    return engineAt(engineVersion)(inputs, prevInputs);
}
