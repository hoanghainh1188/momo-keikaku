/**
 * Story 4.5 — read-only active Baseline slice for the Plan-grid Baseline compare preset.
 *
 * Loads one consistent active head: resolve max `baseline_version.seq` once, then load that
 * version's `baseline_wp` rows + pinned `schedule_run_seq` by the same seq (Epic 4 retro F10).
 * Never re-resolves max independently for wps vs pin — avoids READ COMMITTED tear under
 * concurrent Re-baseline. Stays in `app/baseline` so `db/repositories/baseline` remains
 * fenced (depcruise). Never writes; never reads `wp_schedule` for Divergence sources.
 */
import { parseStoredInputs, parseStoredOutputs, } from '@momo/domain';
import { baselineRepositoryOn } from '../../../db/src/repositories/baseline';
import { scheduleRepositoryOn } from '../../../db/src/repositories/schedule';
const EMPTY = {
    versionSeq: null,
    pinSeq: null,
    baselineByWp: new Map(),
    baselineDurationByWp: new Map(),
    pinCalendar: null,
};
/** Load active Baseline cost projection + pin duration map for Plan-grid assembly. */
export async function loadActiveBaselineForGrid(bound, projectId) {
    const baseline = baselineRepositoryOn(bound);
    const schedule = scheduleRepositoryOn(bound);
    // One watermark: max seq once. Wps + pin load by that seq only (F10) — not
    // loadActiveBaselineWps / latestPinnedScheduleRunSeq, which each re-select max.
    const versionSeq = await baseline.latestVersionSeq(projectId);
    if (versionSeq === null)
        return EMPTY;
    const [wps, pinSeq] = await Promise.all([
        baseline.loadBaselineWpsForVersion(projectId, versionSeq),
        baseline.scheduleRunSeqForVersion(projectId, versionSeq),
    ]);
    // Fail closed if the resolved seq vanished between the max read and the by-seq loads
    // (append-only heads normally do not vanish; empty avoids a mixed / half-missing head).
    if (pinSeq === null)
        return EMPTY;
    const baselineByWp = new Map();
    for (const row of wps) {
        baselineByWp.set(row.wpId, {
            wpId: row.wpId,
            start: row.start,
            finish: row.finish,
            baselineMh: row.baselineMh,
        });
    }
    const baselineDurationByWp = new Map();
    let pinCalendar = null;
    const run = await schedule.runBySeq(projectId, pinSeq);
    if (run !== null && run.haltedReason === null && run.outputs !== null) {
        try {
            const storedInputs = parseStoredInputs(run.inputs);
            // Touch outputs so a corrupt pin still fails closed (no silent Current Plan).
            parseStoredOutputs(run.outputs);
            pinCalendar = storedInputs.calendar;
            for (const wp of storedInputs.wps) {
                baselineDurationByWp.set(wp.id, wp.durationDays);
            }
        }
        catch {
            // Undecodable pin — Baseline dates/effort still show; duration/calendar stay empty.
        }
    }
    return {
        versionSeq,
        pinSeq,
        baselineByWp,
        baselineDurationByWp,
        pinCalendar,
    };
}
