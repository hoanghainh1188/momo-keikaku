/**
 * Thin plan-edit helpers for stories 2.10 / 2.11 UI (complete / delete / derived-date refuse;
 * Project schedule settings). Reads and writes go through the fence — never a second mutator.
 */
import { z } from 'zod';
import { and, eq, isNull } from 'drizzle-orm';
import { projectDate } from '@momo/domain';
import { planInputRepositoryOn } from '../../../db/src/repositories/plan-input';
import { scheduleRepositoryOn } from '../../../db/src/repositories/schedule';
import { projectNotFound } from '../../../db/src/project-not-found';
import * as s from '../../../db/src/schema';
import { authorize, PROJECT_REACH_ROLES } from '../authz/authorize';
import { fail, ok } from '../result';
import { applyPlanChange, } from './apply-plan-change';
import { readFirstObservedActivity } from './first-observed';
export const DERIVED_DATE_TEACHING = 'Planned dates are derived. To pin a date, set a constraint.';
/** Exact teaching copy for set/clear Project finish (FR-43, UX-DR5). */
export const PROJECT_FINISH_TEACHING = 'This moves no work package. It changes what Float is measured against, and lets Float go negative';
export const NO_PROJECT_START_YET = 'no project start yet';
/** Advance preview copy (UX-DR14) — count is remaining leaves without actual finish. */
export function dataDateAdvancePreview(dataDate, remainingCount) {
    // Format as "26 Sep" style without locale libs — ISO YYYY-MM-DD → day mon abbrev.
    const [, m, d] = dataDate.split('-').map(Number);
    const months = [
        'Jan',
        'Feb',
        'Mar',
        'Apr',
        'May',
        'Jun',
        'Jul',
        'Aug',
        'Sep',
        'Oct',
        'Nov',
        'Dec',
    ];
    const label = `${d} ${months[(m ?? 1) - 1] ?? 'Jan'}`;
    return `Advancing to ${label} re-dates ${remainingCount} remaining work packages`;
}
function asBound(scheduling) {
    return scheduling;
}
/** Project-local calendar day for the complete-flow finish proposal (UX-DR13). */
export function proposedCompleteDay(now, tzOffsetMinutes) {
    return projectDate(now.toISOString(), tzOffsetMinutes);
}
/** Read-only: Project schedule settings + per-WP constraints for the thin plan / settings UI. */
export async function getPlanThinUiState(deps, ctx, input) {
    const roles = authorize(ctx, { roles: PROJECT_REACH_ROLES, projectId: input.projectId });
    if (!roles.ok)
        return roles;
    const value = await deps.transaction(deps.handle, ctx.tenantId, async (scope) => {
        const bound = asBound(scope.bound);
        const [project] = await bound.tx
            .select({
            projectStart: s.project.projectStart,
            projectFinish: s.project.projectFinish,
            dataDate: s.project.dataDate,
            tzOffsetMinutes: s.project.tzOffsetMinutes,
            calendarJp: s.project.calendarJp,
            calendarVn: s.project.calendarVn,
        })
            .from(s.project)
            .where(and(eq(s.project.tenantId, bound.tenantId), eq(s.project.id, input.projectId)));
        if (!project)
            throw projectNotFound(input.projectId);
        const rows = await bound.tx
            .select({
            id: s.workPackage.id,
            constraintType: s.workPackage.constraintType,
            constraintDate: s.workPackage.constraintDate,
        })
            .from(s.workPackage)
            .where(and(eq(s.workPackage.tenantId, bound.tenantId), eq(s.workPackage.projectId, input.projectId), isNull(s.workPackage.deletedAt)));
        const planInput = planInputRepositoryOn(bound);
        const remainingLeafCount = await planInput.remainingLeafCount(input.projectId);
        const schedule = scheduleRepositoryOn(bound);
        const projectNonWorkingDays = await schedule.liveProjectNonWorkingDays(input.projectId);
        const constraints = new Map(rows.map((r) => [
            r.id,
            { constraintType: r.constraintType, constraintDate: r.constraintDate },
        ]));
        return {
            projectStart: project.projectStart,
            projectFinish: project.projectFinish,
            dataDate: project.dataDate,
            tzOffsetMinutes: project.tzOffsetMinutes,
            calendarJp: project.calendarJp,
            calendarVn: project.calendarVn,
            projectNonWorkingDays,
            remainingLeafCount,
            constraints,
        };
    });
    return ok(value);
}
/** Read-only: first-observed activity date for the complete flow (never writes). */
export async function getFirstObservedActivity(deps, ctx, input) {
    const roles = authorize(ctx, { roles: PROJECT_REACH_ROLES, projectId: input.projectId });
    if (!roles.ok)
        return roles;
    const value = await deps.transaction(deps.handle, ctx.tenantId, async (scope) => {
        const firstObserved = await readFirstObservedActivity(asBound(scope.bound), input.projectId, input.wpId);
        return { firstObserved };
    });
    return ok(value);
}
/** Read-only: edge endpoints listed in the delete confirmation. */
export async function getWpDeleteConfirm(deps, ctx, input) {
    const roles = authorize(ctx, { roles: PROJECT_REACH_ROLES, projectId: input.projectId });
    if (!roles.ok)
        return roles;
    const value = await deps.transaction(deps.handle, ctx.tenantId, async (scope) => {
        const planInput = planInputRepositoryOn(asBound(scope.bound));
        const edges = await planInput.listEdgeEndpoints(input.projectId, input.wpId);
        return { edges };
    });
    return ok(value);
}
/**
 * Teaching refuse for a derived-date edit attempt (UX-DR12). Nothing is written; the UI moves
 * focus to the constraint cell.
 */
export function refuseDerivedDateEdit() {
    return fail('invalid_input', {
        derivedDate: ['teaching_refuse'],
        message: [DERIVED_DATE_TEACHING],
    });
}
const completeSchema = z.object({
    projectId: z.string().min(1),
    wpId: z.string().min(1),
    actualStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
    actualFinish: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    source: z.enum(['typed', 'accepted-from-proposal']),
    advanceDataDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});
/** Mark-complete through the fence (propose today / accept first-observed). */
export async function completeWorkPackage(deps, ctx, input) {
    const parsed = completeSchema.safeParse(input);
    if (!parsed.success)
        return fail('invalid_input');
    const command = parsed.data;
    return applyPlanChange(deps, ctx, {
        kind: 'patch_actual_dates',
        projectId: command.projectId,
        wpId: command.wpId,
        actualStart: command.actualStart,
        actualFinish: command.actualFinish,
        source: command.source,
        ...(command.advanceDataDate !== undefined
            ? { advanceDataDate: command.advanceDataDate }
            : {}),
    });
}
const deleteSchema = z.object({
    projectId: z.string().min(1),
    wpId: z.string().min(1),
});
/** Soft-delete a WP through the fence (edges hard-deleted, never relinked). */
export async function deleteWorkPackage(deps, ctx, input) {
    const parsed = deleteSchema.safeParse(input);
    if (!parsed.success)
        return fail('invalid_input');
    return applyPlanChange(deps, ctx, {
        kind: 'delete_wp',
        projectId: parsed.data.projectId,
        wpId: parsed.data.wpId,
    });
}
const setStartSchema = z.object({
    projectId: z.string().min(1),
    projectStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    dataDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});
/** Set Project start (+ Data Date defaulting to today inside the fence). */
export async function setProjectStart(deps, ctx, input) {
    const parsed = setStartSchema.safeParse(input);
    if (!parsed.success)
        return fail('invalid_input');
    return applyPlanChange(deps, ctx, {
        kind: 'set_project_start',
        projectId: parsed.data.projectId,
        projectStart: parsed.data.projectStart,
        ...(parsed.data.dataDate !== undefined ? { dataDate: parsed.data.dataDate } : {}),
    });
}
const projectIdSchema = z.object({ projectId: z.string().min(1) });
/** Clear Project start — returns to "no project start yet" without recalculation (Q2→A). */
export async function clearProjectStart(deps, ctx, input) {
    const parsed = projectIdSchema.safeParse(input);
    if (!parsed.success)
        return fail('invalid_input');
    return applyPlanChange(deps, ctx, {
        kind: 'clear_project_start',
        projectId: parsed.data.projectId,
    });
}
const finishSchema = z.object({
    projectId: z.string().min(1),
    projectFinish: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
    /** Must be true — UI shows PROJECT_FINISH_TEACHING before submit. */
    confirmed: z.literal(true),
});
/** Set or clear Project finish after teaching confirm. */
export async function patchProjectFinishSetting(deps, ctx, input) {
    const parsed = finishSchema.safeParse(input);
    if (!parsed.success)
        return fail('invalid_input');
    return applyPlanChange(deps, ctx, {
        kind: 'patch_project_finish',
        projectId: parsed.data.projectId,
        projectFinish: parsed.data.projectFinish,
    });
}
const dataDateSchema = z.object({
    projectId: z.string().min(1),
    dataDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});
/** Standalone Data Date advance through the fence. */
export async function patchDataDateSetting(deps, ctx, input) {
    const parsed = dataDateSchema.safeParse(input);
    if (!parsed.success)
        return fail('invalid_input');
    return applyPlanChange(deps, ctx, {
        kind: 'patch_data_date',
        projectId: parsed.data.projectId,
        dataDate: parsed.data.dataDate,
    });
}
