/**
 * Thin plan-edit helpers for story 2.10 UI (complete / delete confirm / derived-date refuse).
 * Reads and writes go through the fence or schedule-owned ports — never a second mutator.
 */
import { z } from 'zod';
import type { Bound } from '../../../db/src/bound';
import { planInputRepositoryOn } from '../../../db/src/repositories/plan-input';
import { authorize, PROJECT_REACH_ROLES } from '../authz/authorize';
import type { RequestContext } from '../authz/request-context';
import type { SchedulingBound } from '../ports/schedule-write';
import { fail, ok, type Result } from '../result';
import {
  applyPlanChange,
  type ApplyPlanChangeDeps,
  type ApplyPlanChangeResult,
} from './apply-plan-change';
import { readFirstObservedActivity } from './first-observed';

export const DERIVED_DATE_TEACHING =
  'Planned dates are derived. To pin a date, set a constraint.';

function asBound(scheduling: SchedulingBound): Bound {
  return scheduling as Bound;
}

/** Read-only: first-observed activity date for the complete flow (never writes). */
export async function getFirstObservedActivity<Handle>(
  deps: ApplyPlanChangeDeps<Handle>,
  ctx: RequestContext,
  input: { readonly projectId: string; readonly wpId: string },
): Promise<Result<{ readonly firstObserved: string | null }>> {
  const roles = authorize(ctx, { roles: PROJECT_REACH_ROLES, projectId: input.projectId });
  if (!roles.ok) return roles;

  const value = await deps.transaction(deps.handle, ctx.tenantId, async (scope) => {
    const firstObserved = await readFirstObservedActivity(
      asBound(scope.bound),
      input.projectId,
      input.wpId,
    );
    return { firstObserved };
  });
  return ok(value);
}

/** Read-only: edge endpoints listed in the delete confirmation. */
export async function getWpDeleteConfirm<Handle>(
  deps: ApplyPlanChangeDeps<Handle>,
  ctx: RequestContext,
  input: { readonly projectId: string; readonly wpId: string },
): Promise<
  Result<{
    readonly edges: readonly {
      readonly predecessorWpId: string;
      readonly successorWpId: string;
    }[];
  }>
> {
  const roles = authorize(ctx, { roles: PROJECT_REACH_ROLES, projectId: input.projectId });
  if (!roles.ok) return roles;

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
export function refuseDerivedDateEdit(): Result<never> {
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
export async function completeWorkPackage<Handle>(
  deps: ApplyPlanChangeDeps<Handle>,
  ctx: RequestContext,
  input: unknown,
): Promise<Result<ApplyPlanChangeResult>> {
  const parsed = completeSchema.safeParse(input);
  if (!parsed.success) return fail('invalid_input');
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
export async function deleteWorkPackage<Handle>(
  deps: ApplyPlanChangeDeps<Handle>,
  ctx: RequestContext,
  input: unknown,
): Promise<Result<ApplyPlanChangeResult>> {
  const parsed = deleteSchema.safeParse(input);
  if (!parsed.success) return fail('invalid_input');
  return applyPlanChange(deps, ctx, {
    kind: 'delete_wp',
    projectId: parsed.data.projectId,
    wpId: parsed.data.wpId,
  });
}
