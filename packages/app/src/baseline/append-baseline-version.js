import { lockWatermark } from '../../../db/src/watermark-lock';
import { baselineRepositoryOn, } from '../../../db/src/repositories/baseline';
import { scheduleRepositoryOn } from '../../../db/src/repositories/schedule';
import { audit } from '../audit';
import { refuse } from '../use-cases/audited-write';
function asBound(bound) {
    return bound;
}
/**
 * Map leaf projections + pinned run dates into append-only `baseline_wp` rows.
 * Refuses when a leaf has no dates in the gate result (incomplete_plan).
 */
export function buildBaselineWpRows(leaves, leafDates, nextId) {
    return leaves.map((leaf) => {
        const dates = leafDates.get(leaf.wpId);
        if (dates === undefined) {
            refuse('invalid_input', {
                baseline: ['incomplete_plan'],
                blockingWpIds: [leaf.wpId],
            });
        }
        return {
            id: nextId(),
            wpId: leaf.wpId,
            start: dates.start,
            finish: dates.finish,
            baselineMh: leaf.plannedMh,
            isMilestone: leaf.isMilestone,
            isCatchAll: leaf.isCatchAll,
        };
    });
}
/**
 * Dual-gate (early + under Project lock) → append version + leaf rows → audit.
 * Callers supply reason policy, gate choice, and audit action name.
 */
export async function appendBaselineVersionWithLeaves(args) {
    const bound = asBound(args.bound);
    const baseline = baselineRepositoryOn(bound);
    const schedule = scheduleRepositoryOn(bound);
    const loadGateInput = async () => {
        const [projectStart, existingBaselineSeq, latestRun, successfulRun, leaves] = await Promise.all([
            baseline.projectStart(args.projectId),
            baseline.latestVersionSeq(args.projectId),
            schedule.latestRun(args.projectId),
            schedule.latestSuccessfulRun(args.projectId),
            baseline.loadLeafProjections(args.projectId),
        ]);
        return { projectStart, existingBaselineSeq, latestRun, successfulRun, leaves };
    };
    // Long reads before the exclusive lock (AD-20) — early refuse without holding it.
    const early = await loadGateInput();
    const earlyGate = args.evaluateGates(early);
    if (!earlyGate.ok) {
        refuse('invalid_input', earlyGate.details);
    }
    // AD-20: exclusive Project lock, then re-read + re-gate (closes concurrent TOCTOU).
    await lockWatermark(bound, { kind: 'project', projectId: args.projectId });
    const locked = await loadGateInput();
    const gate = args.evaluateGates(locked);
    if (!gate.ok) {
        refuse('invalid_input', gate.details);
    }
    const { scheduleRunSeq, leafDates } = gate;
    const versionId = args.ids.next();
    const wpRows = buildBaselineWpRows(locked.leaves, leafDates, () => args.ids.next());
    const { seq } = await baseline.appendVersionWithWps({
        projectId: args.projectId,
        id: versionId,
        scheduleRunSeq,
        reason: args.reason,
        actor: args.stamp.actor,
        at: args.stamp.at,
    }, wpRows);
    await audit.record(args.scope, args.stamp, args.auditAction, args.projectId, {
        baselineVersionSeq: seq,
        baselineVersionId: versionId,
        scheduleRunSeq,
        leafCount: wpRows.length,
        reason: args.reason,
    });
    return {
        baselineVersionSeq: seq,
        baselineVersionId: versionId,
        scheduleRunSeq,
        leafCount: wpRows.length,
        reason: args.reason,
    };
}
