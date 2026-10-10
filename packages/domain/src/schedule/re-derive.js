/**
 * Pure re-derivation gate over a stored `schedule_run` (story 4.2, FR-15 / AR-35 / AR-51 / NFR-C1).
 *
 * Reads only the pin's stored jsonb + optional prev-run inputs — never the Current Plan.
 * Dispatches under the run's own recorded `engine_version`. Compares through the AD-4 codec's
 * canonical decoded form (`stringify(encode(…))`), with `stripRemainingDays` on the re-derived
 * side. Critical path equality is ordered-array equality inside that form (AR-55).
 */
import { encode, stringify } from '../present/codec';
import * as engineVersion from './engine-version';
import { decodeScheduleInputs, decodeScheduleOutputs, encodeScheduleOutputs, parseStoredInputs, parseStoredOutputs, stripRemainingDays, } from './stored-run';
/**
 * Re-derive a stored run under its own `engine_version` and codec-compare to stored outputs.
 *
 * Throws `RangeError` naming an unknown `engine_version` (same as the corpus registry).
 */
export function reDeriveStoredRun(pin) {
    if (pin.outputs == null || (pin.haltedReason != null && pin.haltedReason !== '')) {
        return {
            ok: false,
            reason: 'incomplete_pin',
            message: pin.outputs == null
                ? 're-derive refuses incomplete pin: outputs are null'
                : `re-derive refuses incomplete pin: haltedReason=${pin.haltedReason}`,
        };
    }
    const storedInputs = parseStoredInputs(pin.inputs);
    const domainInputs = decodeScheduleInputs(storedInputs);
    const prevInputs = pin.prevInputs === undefined || pin.prevInputs === null
        ? null
        : decodeScheduleInputs(parseStoredInputs(pin.prevInputs));
    const orderedWpIds = storedInputs.wps.map((wp) => wp.id);
    const expected = decodeScheduleOutputs(parseStoredOutputs(pin.outputs), orderedWpIds);
    // Namespace call so tests can spy the pin's stored key (AR-51) without a second registry entry.
    const result = engineVersion.recalculateAt(pin.engineVersion, domainInputs, prevInputs);
    if (result.kind !== 'scheduled') {
        return {
            ok: false,
            reason: 'engine_halted',
            message: `re-derive halted under engine_version "${pin.engineVersion}" (${result.reason})`,
        };
    }
    // Align re-derived owned rows to the stored parallel shape (placeholders for foreign WPs),
    // then compare decoded forms — never raw jsonb text.
    const actual = decodeScheduleOutputs(encodeScheduleOutputs(stripRemainingDays(result.outputs), orderedWpIds), orderedWpIds);
    const expectedText = stringify(encode(expected));
    const actualText = stringify(encode(actual));
    if (expectedText === actualText)
        return { ok: true };
    return {
        ok: false,
        reason: 'mismatch',
        message: 're-derive codec mismatch (dates / Float / violations / critical path)',
        expected: expectedText,
        actual: actualText,
    };
}
