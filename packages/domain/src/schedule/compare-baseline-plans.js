/**
 * Baseline↔Baseline plan compare (story 4.4, FR-16).
 *
 * Diffs two pinned `schedule_run` payloads (decoded stored inputs + outputs) as plans: project-
 * level input change lists (edges first-class) plus WP date deltas matched by `wp_id` (AR-55),
 * with graph-aware attribution. Adjacent-run What-moved (`cause.ts`) is a different product —
 * this module owns Baseline version compare only.
 */
import { compareWp } from './order';
function edgeKey(edge) {
    return `${edge.predecessorWpId}\0${edge.successorWpId}\0${edge.type}`;
}
function resolveEdges(inputs) {
    const resolved = [];
    for (const e of inputs.edges) {
        const pred = inputs.wps[e.predecessorId];
        const succ = inputs.wps[e.successorId];
        // Corrupt pins may carry out-of-bounds indexes — skip rather than throw.
        if (pred === undefined || succ === undefined)
            continue;
        resolved.push({
            predecessorWpId: pred.id,
            successorWpId: succ.id,
            type: 'FS',
            lagDays: e.lagDays,
        });
    }
    return resolved;
}
function samePct(a, b) {
    if (a === null && b === null)
        return true;
    if (a === null || b === null)
        return false;
    return a.num === b.num && a.den === b.den;
}
function wpFieldChanges(from, to, wpId) {
    const changes = [];
    if (from === undefined && to === undefined)
        return changes;
    if (from === undefined || to === undefined) {
        // WP present in only one pin — treat every differing field that exists as a change.
        const side = to ?? from;
        if (side.durationDays !== null || from === undefined || to === undefined) {
            changes.push({
                kind: 'duration_changed',
                wpId,
                fromDays: from?.durationDays ?? null,
                toDays: to?.durationDays ?? null,
            });
        }
        if (from?.constraintType !== to?.constraintType ||
            from?.constraintDate !== to?.constraintDate ||
            from === undefined ||
            to === undefined) {
            changes.push({
                kind: 'constraint_changed',
                wpId,
                fromType: from?.constraintType ?? 'asap',
                fromDate: from?.constraintDate ?? null,
                toType: to?.constraintType ?? 'asap',
                toDate: to?.constraintDate ?? null,
            });
        }
        if (from?.actualStart !== to?.actualStart ||
            from?.actualFinish !== to?.actualFinish ||
            from === undefined ||
            to === undefined) {
            changes.push({
                kind: 'actual_dates_changed',
                wpId,
                fromStart: from?.actualStart ?? null,
                fromFinish: from?.actualFinish ?? null,
                toStart: to?.actualStart ?? null,
                toFinish: to?.actualFinish ?? null,
            });
        }
        if (!samePct(from?.recordedPct ?? null, to?.recordedPct ?? null) || from === undefined || to === undefined) {
            changes.push({
                kind: 'recorded_pct_changed',
                wpId,
                fromPct: from?.recordedPct ?? null,
                toPct: to?.recordedPct ?? null,
            });
        }
        if (from?.isMilestone !== to?.isMilestone || from === undefined || to === undefined) {
            changes.push({
                kind: 'milestone_changed',
                wpId,
                from: from?.isMilestone ?? false,
                to: to?.isMilestone ?? false,
            });
        }
        return changes;
    }
    if (from.durationDays !== to.durationDays) {
        changes.push({
            kind: 'duration_changed',
            wpId,
            fromDays: from.durationDays,
            toDays: to.durationDays,
        });
    }
    if (from.constraintType !== to.constraintType || from.constraintDate !== to.constraintDate) {
        changes.push({
            kind: 'constraint_changed',
            wpId,
            fromType: from.constraintType,
            fromDate: from.constraintDate,
            toType: to.constraintType,
            toDate: to.constraintDate,
        });
    }
    if (from.actualStart !== to.actualStart || from.actualFinish !== to.actualFinish) {
        changes.push({
            kind: 'actual_dates_changed',
            wpId,
            fromStart: from.actualStart,
            fromFinish: from.actualFinish,
            toStart: to.actualStart,
            toFinish: to.actualFinish,
        });
    }
    if (!samePct(from.recordedPct, to.recordedPct)) {
        changes.push({
            kind: 'recorded_pct_changed',
            wpId,
            fromPct: from.recordedPct,
            toPct: to.recordedPct,
        });
    }
    if (from.isMilestone !== to.isMilestone) {
        changes.push({
            kind: 'milestone_changed',
            wpId,
            from: from.isMilestone,
            to: to.isMilestone,
        });
    }
    return changes;
}
function collectProjectChanges(from, to) {
    const changes = [];
    const fromEdges = new Map(resolveEdges(from).map((e) => [edgeKey(e), e]));
    const toEdges = new Map(resolveEdges(to).map((e) => [edgeKey(e), e]));
    for (const [key, edge] of toEdges) {
        const prev = fromEdges.get(key);
        if (prev === undefined) {
            changes.push({
                kind: 'edge_added',
                edge: {
                    predecessorWpId: edge.predecessorWpId,
                    successorWpId: edge.successorWpId,
                    type: edge.type,
                },
            });
        }
        else if (prev.lagDays !== edge.lagDays) {
            changes.push({
                kind: 'edge_lag_changed',
                edge: {
                    predecessorWpId: edge.predecessorWpId,
                    successorWpId: edge.successorWpId,
                    type: edge.type,
                },
                fromLagDays: prev.lagDays,
                toLagDays: edge.lagDays,
            });
        }
    }
    for (const [key, edge] of fromEdges) {
        if (!toEdges.has(key)) {
            changes.push({
                kind: 'edge_removed',
                edge: {
                    predecessorWpId: edge.predecessorWpId,
                    successorWpId: edge.successorWpId,
                    type: edge.type,
                },
            });
        }
    }
    const fromWps = new Map(from.wps.map((w) => [w.id, w]));
    const toWps = new Map(to.wps.map((w) => [w.id, w]));
    const allWpIds = new Set([...fromWps.keys(), ...toWps.keys()]);
    for (const wpId of [...allWpIds].sort()) {
        changes.push(...wpFieldChanges(fromWps.get(wpId), toWps.get(wpId), wpId));
    }
    if (from.calendar.versionSeq !== to.calendar.versionSeq) {
        changes.push({
            kind: 'calendar_version_changed',
            fromVersionSeq: from.calendar.versionSeq,
            toVersionSeq: to.calendar.versionSeq,
        });
    }
    if (from.projectStart !== to.projectStart) {
        changes.push({
            kind: 'project_start_changed',
            from: from.projectStart,
            to: to.projectStart,
        });
    }
    if (from.projectFinish !== to.projectFinish) {
        changes.push({
            kind: 'project_finish_changed',
            from: from.projectFinish,
            to: to.projectFinish,
        });
    }
    if (from.dataDate !== to.dataDate) {
        changes.push({
            kind: 'data_date_changed',
            from: from.dataDate,
            to: to.dataDate,
        });
    }
    return changes;
}
/** Union reverse adjacency: successor → predecessors (both graphs). */
function unionPredecessors(from, to) {
    const map = new Map();
    const add = (succ, pred) => {
        let set = map.get(succ);
        if (set === undefined) {
            set = new Set();
            map.set(succ, set);
        }
        set.add(pred);
    };
    for (const e of resolveEdges(from))
        add(e.successorWpId, e.predecessorWpId);
    for (const e of resolveEdges(to))
        add(e.successorWpId, e.predecessorWpId);
    return map;
}
function transitivePredecessors(wpId, reverse) {
    const seen = new Set();
    const stack = [...(reverse.get(wpId) ?? [])];
    while (stack.length > 0) {
        const id = stack.pop();
        if (seen.has(id))
            continue;
        seen.add(id);
        for (const pred of reverse.get(id) ?? []) {
            if (!seen.has(pred))
                stack.push(pred);
        }
    }
    return seen;
}
function changeTouchesWp(change, wpId) {
    switch (change.kind) {
        case 'edge_added':
        case 'edge_removed':
        case 'edge_lag_changed':
            return change.edge.successorWpId === wpId;
        case 'constraint_changed':
        case 'duration_changed':
        case 'actual_dates_changed':
        case 'recorded_pct_changed':
        case 'milestone_changed':
            return change.wpId === wpId;
        case 'calendar_version_changed':
        case 'project_start_changed':
        case 'project_finish_changed':
        case 'data_date_changed':
            return true;
    }
}
function changeTouchesPredecessorChain(change, wpId, preds) {
    if (changeTouchesWp(change, wpId))
        return true;
    switch (change.kind) {
        case 'edge_added':
        case 'edge_removed':
        case 'edge_lag_changed':
            // Edge whose successor is on the predecessor chain (or is this WP — already covered).
            return preds.has(change.edge.successorWpId);
        case 'constraint_changed':
        case 'duration_changed':
        case 'actual_dates_changed':
        case 'recorded_pct_changed':
        case 'milestone_changed':
            return preds.has(change.wpId);
        default:
            return false;
    }
}
function datesDiffer(fromOut, toOut) {
    const fromStart = fromOut?.earlyStart ?? null;
    const fromFinish = fromOut?.earlyFinish ?? null;
    const toStart = toOut?.earlyStart ?? null;
    const toFinish = toOut?.earlyFinish ?? null;
    return fromStart !== toStart || fromFinish !== toFinish;
}
/**
 * Compare two Baseline-pinned plans. `from` / `to` are the older and newer pins' decoded
 * stored payloads (never Current Plan / live columns).
 */
export function compareBaselinePlans(from, to) {
    const projectChanges = collectProjectChanges(from.inputs, to.inputs);
    const reverse = unionPredecessors(from.inputs, to.inputs);
    const fromWpById = new Map(from.inputs.wps.map((w, i) => [w.id, { wp: w, index: i }]));
    const toWpById = new Map(to.inputs.wps.map((w, i) => [w.id, { wp: w, index: i }]));
    const allIds = new Set([...fromWpById.keys(), ...toWpById.keys()]);
    const deltas = [];
    for (const wpId of allIds) {
        const fromEntry = fromWpById.get(wpId);
        const toEntry = toWpById.get(wpId);
        const fromOut = fromEntry !== undefined ? from.outputs.wps[fromEntry.index] : undefined;
        const toOut = toEntry !== undefined ? to.outputs.wps[toEntry.index] : undefined;
        if (!datesDiffer(fromOut, toOut))
            continue;
        const wbsCode = toEntry?.wp.wbsCode ?? fromEntry?.wp.wbsCode ?? '';
        const preds = transitivePredecessors(wpId, reverse);
        const accountedBy = projectChanges.filter((c) => changeTouchesPredecessorChain(c, wpId, preds));
        deltas.push({
            wpId,
            wbsCode,
            fromEarlyStart: fromOut?.earlyStart ?? null,
            fromEarlyFinish: fromOut?.earlyFinish ?? null,
            toEarlyStart: toOut?.earlyStart ?? null,
            toEarlyFinish: toOut?.earlyFinish ?? null,
            accountedBy,
            unattributed: accountedBy.length === 0,
        });
    }
    deltas.sort((a, b) => compareWp({ id: a.wpId, wbsCode: a.wbsCode }, { id: b.wpId, wbsCode: b.wbsCode }));
    return { projectChanges, wpDateDeltas: deltas };
}
