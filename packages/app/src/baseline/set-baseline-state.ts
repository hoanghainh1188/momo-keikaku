/**
 * Read-side eligibility for *Set Baseline* (story 4.1, UX-DR23).
 *
 * Not on the F10 write surface — same pattern as `getPlanGridState`. Pages use this to disable
 * the control with not-schedulable count + Plan exceptions-rail link before the PM clicks.
 */
import {
  authorize,
  PROJECT_REACH_ROLES,
} from '../authz/authorize';
import type { RequestContext } from '../authz/request-context';
import { isProjectNotFound } from '../ports/project-read';
import type { SchedulingBound } from '../ports/schedule-write';
import { fail, ok, type Result } from '../result';
import type { ApplyPlanChangeDeps } from '../schedule/apply-plan-change';
import type { Bound } from '../../../db/src/bound';
import { baselineRepositoryOn } from '../../../db/src/repositories/baseline';
import { scheduleRepositoryOn } from '../../../db/src/repositories/schedule';
import { evaluateBaselineSetGates } from './gates';
import { FIRST_SET_REASON } from './set-baseline';

export type BaselineSetState = {
  readonly projectId: string;
  /** True when first Set would succeed right now. */
  readonly canSet: boolean;
  /** True when any Baseline version already exists (Re-baseline is out of 4.1). */
  readonly hasBaseline: boolean;
  readonly notSchedulableCount: number;
  readonly blockingWpIds: readonly string[];
  readonly refuseReason: string | null;
  /** Plan deep-link target for the exceptions rail (not-schedulable group). */
  readonly exceptionsRailHref: string;
  readonly firstSetReason: string;
};

function asBound(bound: SchedulingBound): Bound {
  return bound as Bound;
}

/** Authorised eligibility snapshot for Review / Plan / Baselines *Set Baseline* controls. */
export async function getBaselineSetState<Handle>(
  deps: ApplyPlanChangeDeps<Handle>,
  ctx: RequestContext,
  input: { readonly projectId: string },
): Promise<Result<BaselineSetState>> {
  const roles = authorize(ctx, { roles: PROJECT_REACH_ROLES, projectId: input.projectId });
  if (!roles.ok) return roles;

  try {
    const value = await deps.transaction(deps.handle, ctx.tenantId, async (scope) => {
      const bound = asBound(scope.bound);
      const baseline = baselineRepositoryOn(bound);
      const schedule = scheduleRepositoryOn(bound);

      const [projectStart, existingSeq, latestRun, successfulRun, leaves] = await Promise.all([
        baseline.projectStart(input.projectId),
        baseline.latestVersionSeq(input.projectId),
        schedule.latestRun(input.projectId),
        schedule.latestSuccessfulRun(input.projectId),
        baseline.loadLeafProjections(input.projectId),
      ]);

      const gate = evaluateBaselineSetGates({
        projectStart,
        existingBaselineSeq: existingSeq,
        latestRun,
        successfulRun,
        leaves,
      });

      const exceptionsRailHref = `/p/${input.projectId}/plan?exceptions=not_schedulable`;

      if (gate.ok) {
        return {
          projectId: input.projectId,
          canSet: true,
          hasBaseline: false,
          notSchedulableCount: 0,
          blockingWpIds: [],
          refuseReason: null,
          exceptionsRailHref,
          firstSetReason: FIRST_SET_REASON,
        } satisfies BaselineSetState;
      }

      return {
        projectId: input.projectId,
        canSet: false,
        hasBaseline: gate.reason === 'already_exists',
        notSchedulableCount: gate.notSchedulableCount,
        blockingWpIds: gate.blockingWpIds,
        refuseReason: gate.reason,
        exceptionsRailHref,
        firstSetReason: FIRST_SET_REASON,
      } satisfies BaselineSetState;
    });
    return ok(value);
  } catch (error) {
    if (isProjectNotFound(error, input.projectId)) return fail('not_found');
    throw error;
  }
}
