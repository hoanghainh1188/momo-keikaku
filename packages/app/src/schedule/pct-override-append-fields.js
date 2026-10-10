/**
 * Story 6.4: fields appended to `pct_override_event` from a validated `patch_recorded_pct`.
 * Pure so unit tests can assert reason/source without Postgres.
 *
 * Kept outside `apply-plan-change.ts` so F10 / audit+role export scanners do not treat this
 * helper as a schedule write use case.
 */
export function pctOverrideAppendFields(mutation) {
    const source = mutation.source ?? 'plan_edit';
    const reason = source === 'pm_override'
        ? (mutation.reason?.trim() ?? '')
        : mutation.reason !== undefined
            ? mutation.reason.trim() || null
            : null;
    return {
        recordedPctNum: mutation.recordedPctNum,
        recordedPctDen: mutation.recordedPctDen,
        reason,
        source,
    };
}
