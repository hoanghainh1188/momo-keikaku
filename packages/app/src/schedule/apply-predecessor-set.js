import { planInputRepositoryOn } from '../../../db/src/repositories/plan-input';
import { authorize, PROJECT_REACH_ROLES } from '../authz/authorize';
import { fail, ok } from '../result';
import { applyPlanChange, } from './apply-plan-change';
import { diffPredecessorEdges, explainProposedGraphRefuse, parsePredecessorsText, replaceSuccessorEdges, } from './predecessors';
function asBound(scheduling) {
    return scheduling;
}
/**
 * Commit MS-Project predecessor text for one successor leaf.
 * On FR-6a / parse refuse: `invalid_input` with `details.refuse` holding UX prose (keep draft).
 */
export async function applyPredecessorSet(deps, ctx, input) {
    const roles = authorize(ctx, { roles: PROJECT_REACH_ROLES, projectId: input.projectId });
    if (!roles.ok)
        return roles;
    const prepared = await deps.transaction(deps.handle, ctx.tenantId, async (scope) => {
        const bound = asBound(scope.bound);
        const planInput = planInputRepositoryOn(bound);
        const [wps, edges] = await Promise.all([
            planInput.listLiveWorkPackages(input.projectId),
            planInput.listLiveDependencies(input.projectId),
        ]);
        const successor = wps.find((w) => w.id === input.successorWpId);
        if (successor === undefined || !successor.isLeaf) {
            return { kind: 'refuse', message: 'invalid_input' };
        }
        const wbsToId = new Map(wps.map((w) => [w.wbsCode, w.id]));
        const wbsById = new Map(wps.map((w) => [w.id, w.wbsCode]));
        const leafIds = new Set(wps.filter((w) => w.isLeaf).map((w) => w.id));
        const parsed = parsePredecessorsText(input.text, wbsToId, { leafIds });
        if (!parsed.ok) {
            return { kind: 'refuse', message: parsed.message };
        }
        // Self-link is a cycle — still run through validate for consistent wording.
        const planWps = wps.map((w) => ({
            id: w.id,
            wbsCode: w.wbsCode,
            projectId: input.projectId,
            parentId: w.parentId,
        }));
        const planEdges = edges.map((e) => ({
            predecessorId: e.predecessorWpId,
            successorId: e.successorWpId,
        }));
        const proposedEdges = replaceSuccessorEdges(planEdges, input.successorWpId, parsed.edges);
        const refuse = explainProposedGraphRefuse({ projectId: input.projectId, wps: planWps }, proposedEdges, wbsById);
        if (refuse !== null) {
            return { kind: 'refuse', message: refuse };
        }
        const live = edges
            .filter((e) => e.successorWpId === input.successorWpId)
            .map((e) => ({ predecessorWpId: e.predecessorWpId, lagDays: e.lagDays }));
        const mutations = diffPredecessorEdges(input.successorWpId, live, parsed.edges);
        return { kind: 'ready', mutations };
    });
    if (prepared.kind === 'refuse') {
        return fail('invalid_input', { refuse: [prepared.message] });
    }
    if (prepared.mutations.length === 0) {
        return ok({ kind: 'unchanged' });
    }
    let last = null;
    for (const m of prepared.mutations) {
        const result = await applyPlanChange(deps, ctx, {
            ...m,
            projectId: input.projectId,
        });
        if (!result.ok) {
            // Fence backstop: re-explain from the same typed text if codes-only refuse.
            if (result.error.details?.dependencies !== undefined) {
                const again = await deps.transaction(deps.handle, ctx.tenantId, async (scope) => {
                    const bound = asBound(scope.bound);
                    const planInput = planInputRepositoryOn(bound);
                    const [wps, edges] = await Promise.all([
                        planInput.listLiveWorkPackages(input.projectId),
                        planInput.listLiveDependencies(input.projectId),
                    ]);
                    const wbsToId = new Map(wps.map((w) => [w.wbsCode, w.id]));
                    const wbsById = new Map(wps.map((w) => [w.id, w.wbsCode]));
                    const leafIds = new Set(wps.filter((w) => w.isLeaf).map((w) => w.id));
                    const parsed = parsePredecessorsText(input.text, wbsToId, { leafIds });
                    if (!parsed.ok)
                        return parsed.message;
                    const planWps = wps.map((w) => ({
                        id: w.id,
                        wbsCode: w.wbsCode,
                        projectId: input.projectId,
                        parentId: w.parentId,
                    }));
                    const planEdges = edges.map((e) => ({
                        predecessorId: e.predecessorWpId,
                        successorId: e.successorWpId,
                    }));
                    // Explain against the intended final graph (typed set), not the mid-fan-out state.
                    const proposed = replaceSuccessorEdges(planEdges, input.successorWpId, parsed.edges);
                    return (explainProposedGraphRefuse({ projectId: input.projectId, wps: planWps }, proposed, wbsById) ?? result.error.messageKey);
                });
                return fail('invalid_input', { refuse: [again] });
            }
            return result;
        }
        last = result.value;
    }
    return ok(last ?? { kind: 'unchanged' });
}
