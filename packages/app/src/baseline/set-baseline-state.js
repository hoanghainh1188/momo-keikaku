/**
 * Read-side eligibility for *Set Baseline* (story 4.1) and *Re-baseline* (story 4.3, UX-DR23).
 *
 * Not on the F10 write surface — same pattern as `getPlanGridState`. Pages use this to disable
 * the control with not-schedulable count + Plan exceptions-rail link before the PM clicks.
 */
import { authorize, PROJECT_REACH_ROLES, } from '../authz/authorize';
import { isProjectNotFound } from '../ports/project-read';
import { fail, ok } from '../result';
import { baselineRepositoryOn } from '../../../db/src/repositories/baseline';
import { scheduleRepositoryOn } from '../../../db/src/repositories/schedule';
import { evaluateBaselineSetGates, evaluateReBaselineGates } from './gates';
import { FIRST_SET_REASON } from './set-baseline';
function asBound(bound) {
    return bound;
}
async function loadGateRows(deps, tenantId, projectId) {
    return deps.transaction(deps.handle, tenantId, async (scope) => {
        const bound = asBound(scope.bound);
        const baseline = baselineRepositoryOn(bound);
        const schedule = scheduleRepositoryOn(bound);
        const [projectStart, existingSeq, latestRun, successfulRun, leaves] = await Promise.all([
            baseline.projectStart(projectId),
            baseline.latestVersionSeq(projectId),
            schedule.latestRun(projectId),
            schedule.latestSuccessfulRun(projectId),
            baseline.loadLeafProjections(projectId),
        ]);
        return { projectStart, existingSeq, latestRun, successfulRun, leaves };
    });
}
/** Authorised eligibility snapshot for Review / Plan / Baselines *Set Baseline* controls. */
export async function getBaselineSetState(deps, ctx, input) {
    const roles = authorize(ctx, { roles: PROJECT_REACH_ROLES, projectId: input.projectId });
    if (!roles.ok)
        return roles;
    try {
        const rows = await loadGateRows(deps, ctx.tenantId, input.projectId);
        const gate = evaluateBaselineSetGates({
            projectStart: rows.projectStart,
            existingBaselineSeq: rows.existingSeq,
            latestRun: rows.latestRun,
            successfulRun: rows.successfulRun,
            leaves: rows.leaves,
        });
        const exceptionsRailHref = `/p/${input.projectId}/plan?exceptions=not_schedulable`;
        if (gate.ok) {
            return ok({
                projectId: input.projectId,
                canSet: true,
                hasBaseline: false,
                notSchedulableCount: 0,
                blockingWpIds: [],
                refuseReason: null,
                exceptionsRailHref,
                firstSetReason: FIRST_SET_REASON,
            });
        }
        return ok({
            projectId: input.projectId,
            canSet: false,
            hasBaseline: gate.reason === 'already_exists',
            notSchedulableCount: gate.notSchedulableCount,
            blockingWpIds: gate.blockingWpIds,
            refuseReason: gate.reason,
            exceptionsRailHref,
            firstSetReason: FIRST_SET_REASON,
        });
    }
    catch (error) {
        if (isProjectNotFound(error, input.projectId))
            return fail('not_found');
        throw error;
    }
}
/** Authorised eligibility snapshot for Baselines *Re-baseline* control (story 4.3). */
export async function getReBaselineState(deps, ctx, input) {
    const roles = authorize(ctx, { roles: PROJECT_REACH_ROLES, projectId: input.projectId });
    if (!roles.ok)
        return roles;
    try {
        const rows = await loadGateRows(deps, ctx.tenantId, input.projectId);
        const gate = evaluateReBaselineGates({
            projectStart: rows.projectStart,
            existingBaselineSeq: rows.existingSeq,
            latestRun: rows.latestRun,
            successfulRun: rows.successfulRun,
            leaves: rows.leaves,
        });
        const exceptionsRailHref = `/p/${input.projectId}/plan?exceptions=not_schedulable`;
        const hasBaseline = rows.existingSeq !== null;
        if (gate.ok) {
            return ok({
                projectId: input.projectId,
                canReBaseline: true,
                hasBaseline: true,
                notSchedulableCount: 0,
                blockingWpIds: [],
                refuseReason: null,
                exceptionsRailHref,
            });
        }
        return ok({
            projectId: input.projectId,
            canReBaseline: false,
            hasBaseline,
            notSchedulableCount: gate.notSchedulableCount,
            blockingWpIds: gate.blockingWpIds,
            refuseReason: gate.reason,
            exceptionsRailHref,
        });
    }
    catch (error) {
        if (isProjectNotFound(error, input.projectId))
            return fail('not_found');
        throw error;
    }
}
