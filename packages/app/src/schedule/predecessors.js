/**
 * Story 2.14 — MS-Project predecessor text parse/diff and FR-6a under-cell wording.
 *
 * Pure helpers: the web layer stays thin; fence kinds stay unchanged. UX-DR6 sentences are
 * presentation — `checkPlanInvariants` still returns codes only.
 */
import { hasOffences, validate, } from '@momo/domain';
/**
 * Parse MS-Project-shaped predecessor text: `2.3FS+2d, 2.4`.
 * `FS` is omittable; lag is working days and may be negative.
 */
export function parsePredecessorsText(text, wbsToId, options) {
    const trimmed = text.trim();
    if (trimmed === '') {
        return { ok: true, edges: [] };
    }
    const tokens = trimmed.split(',').map((t) => t.trim()).filter((t) => t.length > 0);
    if (tokens.length === 0) {
        return { ok: true, edges: [] };
    }
    const edges = [];
    const seen = new Set();
    for (const token of tokens) {
        const parsed = parseOneToken(token);
        if (!parsed.ok) {
            return { ok: false, message: parsed.message };
        }
        const wpId = wbsToId.get(parsed.wbsCode);
        if (wpId === undefined) {
            return {
                ok: false,
                message: `Unknown work package ${parsed.wbsCode}`,
            };
        }
        if (options?.leafIds !== undefined && !options.leafIds.has(wpId)) {
            return {
                ok: false,
                message: `${parsed.wbsCode} is a summary work package`,
            };
        }
        if (seen.has(wpId)) {
            return {
                ok: false,
                message: `Duplicate predecessor ${parsed.wbsCode}`,
            };
        }
        seen.add(wpId);
        edges.push({ predecessorWpId: wpId, lagDays: parsed.lagDays });
    }
    return { ok: true, edges };
}
/**
 * Diff live edges for one successor against the typed set.
 * Order: removes → re-lags → adds (avoids transient illegal graphs mid-fan-out).
 */
export function diffPredecessorEdges(successorWpId, live, proposed) {
    const liveByPred = new Map(live.map((e) => [e.predecessorWpId, e.lagDays]));
    const proposedByPred = new Map(proposed.map((e) => [e.predecessorWpId, e.lagDays]));
    const mutations = [];
    for (const [predId] of liveByPred) {
        if (!proposedByPred.has(predId)) {
            mutations.push({
                kind: 'remove_dependency',
                predecessorWpId: predId,
                successorWpId,
            });
        }
    }
    for (const [predId, lagDays] of proposedByPred) {
        const liveLag = liveByPred.get(predId);
        if (liveLag === undefined) {
            mutations.push({
                kind: 'add_dependency',
                predecessorWpId: predId,
                successorWpId,
                lagDays,
            });
        }
        else if (liveLag !== lagDays) {
            mutations.push({
                kind: 're_lag_dependency',
                predecessorWpId: predId,
                successorWpId,
                lagDays,
            });
        }
    }
    return mutations;
}
/**
 * Replace this successor's incoming edges in a full edge list (for proposed-graph validate).
 */
export function replaceSuccessorEdges(allEdges, successorWpId, proposed) {
    const kept = allEdges.filter((e) => e.successorId !== successorWpId);
    return [
        ...kept,
        ...proposed.map((p) => ({
            predecessorId: p.predecessorWpId,
            successorId: successorWpId,
        })),
    ];
}
/**
 * UX-DR6 under-cell sentences from `validate` offence lists + WBS map.
 * Never put WP ids in fence `details` — wording lives here.
 * Pass `parentOf` so ancestor lines name the true ancestor (edge direction is either way).
 */
export function explainGraphOffences(offences, wbsById, parentOf) {
    const lines = [];
    const label = (id) => wbsById.get(id) ?? id;
    for (const cycle of offences.cycles) {
        if (cycle.length === 0)
            continue;
        const path = [...cycle, cycle[0]].map(label).join(' → ');
        lines.push(`${path} would be a cycle`);
    }
    for (const edge of offences.ancestorDescendant) {
        const { ancestorId, descendantId } = resolveAncestorPair(edge.predecessorId, edge.successorId, parentOf);
        lines.push(`${label(ancestorId)} is an ancestor of ${label(descendantId)}`);
    }
    for (const edge of offences.summaryEndpoints) {
        for (const summaryId of edge.summaryIds) {
            lines.push(`${label(summaryId)} is a summary work package`);
        }
    }
    for (const _edge of offences.crossProject) {
        lines.push('that work package is in another project');
    }
    // Deduplicate while preserving order (ancestor edges also appear as summary endpoints).
    const seen = new Set();
    const unique = [];
    for (const line of lines) {
        if (seen.has(line))
            continue;
        seen.add(line);
        unique.push(line);
    }
    return unique;
}
/** Validate a proposed graph and return UX-DR6 lines, or null when legal. */
export function explainProposedGraphRefuse(plan, edges, wbsById) {
    const offences = validate(plan, edges);
    if (!hasOffences(offences))
        return null;
    const parentOf = new Map(plan.wps.map((w) => [w.id, w.parentId ?? null]));
    const lines = explainGraphOffences(offences, wbsById, parentOf);
    return lines.length > 0 ? lines.join('; ') : 'invalid dependency';
}
/**
 * Leaf-only autocomplete over WBS code and name (UX-DR6).
 * Empty query → no suggestions (no spurious picks).
 * Web mirrors this in `apps/web/src/lib/plan-pred-suggest.ts` (client cannot import `@momo/app`).
 */
export function filterLeafCandidates(query, candidates, options) {
    const q = query.trim().toLowerCase();
    if (q.length === 0)
        return [];
    const limit = options?.limit ?? 8;
    const out = [];
    for (const c of candidates) {
        if (options?.excludeWpId !== undefined && c.wpId === options.excludeWpId)
            continue;
        const hay = `${c.wbsCode} ${c.name}`.toLowerCase();
        if (!hay.includes(q))
            continue;
        out.push(c);
        if (out.length >= limit)
            break;
    }
    return out;
}
/** One token: `2.3`, `2.3FS`, `2.3FS+2d`, `2.3+2d`, `2.3FS-1d`. */
function parseOneToken(token) {
    const withLag = /^(.+?)(?:FS)?([+-]\d+)d$/i.exec(token);
    if (withLag) {
        const wbsCode = withLag[1].trim();
        const lagDays = Number(withLag[2]);
        if (!isValidWbsToken(wbsCode) || !Number.isInteger(lagDays)) {
            return { ok: false, message: `Cannot parse predecessor "${token}"` };
        }
        return { ok: true, wbsCode, lagDays };
    }
    const withFs = /^(.+?)FS$/i.exec(token);
    if (withFs) {
        const wbsCode = withFs[1].trim();
        if (!isValidWbsToken(wbsCode)) {
            return { ok: false, message: `Cannot parse predecessor "${token}"` };
        }
        return { ok: true, wbsCode, lagDays: 0 };
    }
    if (!isValidWbsToken(token)) {
        return { ok: false, message: `Cannot parse predecessor "${token}"` };
    }
    return { ok: true, wbsCode: token, lagDays: 0 };
}
function isValidWbsToken(wbsCode) {
    return wbsCode.length > 0 && !/\s/.test(wbsCode);
}
function resolveAncestorPair(a, b, parentOf) {
    if (parentOf !== undefined) {
        if (isStrictAncestor(a, b, parentOf))
            return { ancestorId: a, descendantId: b };
        if (isStrictAncestor(b, a, parentOf))
            return { ancestorId: b, descendantId: a };
    }
    // Fallback when no parent map: keep edge order (tests without tree still get a sentence).
    return { ancestorId: a, descendantId: b };
}
function isStrictAncestor(ancestorId, wpId, parentOf) {
    let cur = parentOf.get(wpId) ?? null;
    const seen = new Set();
    while (cur !== null) {
        if (cur === ancestorId)
            return true;
        if (seen.has(cur))
            break;
        seen.add(cur);
        cur = parentOf.get(cur) ?? null;
    }
    return false;
}
