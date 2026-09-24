/**
 * THE ONE FENCE (story 2.9, AR-43 / AD-25 / AD-27):
 * `applyPlanChange(ctx, mutation)` writes a scheduling input and recalculates in one tenant
 * transaction under the per-Project exclusive lock.
 *
 * Minimal closed mutation union (Q4 → A): duration / constraint / dependency patches. Story 2.10
 * widens it. `checkPlanInvariants` runs before every write; 23503/23514 map to `invalid_input`.
 */
import { z } from 'zod';
import type { Bound } from '../../../db/src/bound';
import { lockWatermark } from '../../../db/src/watermark-lock';
import { planInputRepositoryOn } from '../../../db/src/repositories/plan-input';
import { scheduleRepositoryOn } from '../../../db/src/repositories/schedule';
import type { PlanGraphEdge, PlanGraphWp, ScheduleRunCause } from '@momo/domain';
import { authorize, PROJECT_REACH_ROLES } from '../authz/authorize';
import type { RequestContext } from '../authz/request-context';
import { audit, type AuditSink } from '../audit';
import { isProjectNotFound } from '../ports/project-read';
import type { AuditedWriteDeps, WriteStamp } from '../ports/audited-write';
import type { SchedulingBound } from '../ports/schedule-write';
import { fail, type Result } from '../result';
import { refuse, runAuditedWrite } from '../use-cases/audited-write';
import { checkPlanInvariants } from './plan-invariants';
import { mapSchedulingConstraint } from './pg-errors';
import {
  recalculateProject,
  resolveScheduleInputs,
  type RecalculateProjectResult,
} from './recalculate-project';

const noNul = (value: string) => !value.includes('\0');
const id = z.string().min(1).refine(noNul, 'must not contain a NUL character');

const planMutationBase = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('patch_duration'),
    projectId: id,
    wpId: id,
    durationDays: z.number().int().nonnegative().nullable(),
  }),
  z.object({
    kind: z.literal('patch_constraint'),
    projectId: id,
    wpId: id,
    constraintType: z.enum(['asap', 'must_start_on', 'must_finish_on']),
    constraintDate: z.string().nullable(),
  }),
  z.object({
    kind: z.literal('add_dependency'),
    projectId: id,
    predecessorWpId: id,
    successorWpId: id,
    lagDays: z.number().int(),
  }),
  z.object({
    kind: z.literal('remove_dependency'),
    projectId: id,
    predecessorWpId: id,
    successorWpId: id,
  }),
  z.object({
    kind: z.literal('re_lag_dependency'),
    projectId: id,
    predecessorWpId: id,
    successorWpId: id,
    lagDays: z.number().int(),
  }),
]);

/** asap ⇔ null date; must_* ⇔ non-null date. */
export const planMutationSchema = planMutationBase.superRefine((value, ctx) => {
  if (value.kind !== 'patch_constraint') return;
  const asap = value.constraintType === 'asap';
  const nullDate = value.constraintDate === null;
  if (asap !== nullDate) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['constraintDate'],
      message: asap
        ? 'asap requires a null constraintDate'
        : 'must_start_on / must_finish_on require a constraintDate',
    });
  }
});

export type PlanMutation = z.infer<typeof planMutationBase>;

export type ApplyPlanChangeScope = {
  readonly bound: SchedulingBound;
  readonly projectWrite: { readonly projectAnchor: (projectId: string) => Promise<Date> };
  readonly audit: AuditSink;
};

export type ApplyPlanChangeDeps<Handle> = AuditedWriteDeps<Handle, ApplyPlanChangeScope>;

function runCause(mutation: PlanMutation): ScheduleRunCause {
  switch (mutation.kind) {
    case 'patch_duration':
      return 'duration';
    case 'patch_constraint':
      return 'constraint';
    case 'add_dependency':
      return 'dependency_added';
    case 'remove_dependency':
      return 'dependency_removed';
    case 're_lag_dependency':
      return 'dependency_re_lagged';
  }
}

function asBound(scheduling: SchedulingBound): Bound {
  return scheduling as Bound;
}

/** Build the proposed graph after `mutation` — for `checkPlanInvariants` only (no calendar write). */
async function proposedGraph(
  bound: Bound,
  mutation: PlanMutation,
): Promise<{
  readonly plan: { readonly projectId: string; readonly wps: readonly PlanGraphWp[] };
  readonly edges: readonly PlanGraphEdge[];
}> {
  const schedule = scheduleRepositoryOn(bound);
  const rows = await schedule.loadPlanRows(mutation.projectId);
  const wps: PlanGraphWp[] = rows.wps.map((w) => ({
    id: w.id,
    wbsCode: w.wbsCode,
    projectId: mutation.projectId,
    parentId: w.parentId,
  }));
  let edges: PlanGraphEdge[] = rows.edges.map((e) => ({
    predecessorId: e.predecessorWpId,
    successorId: e.successorWpId,
  }));

  switch (mutation.kind) {
    case 'add_dependency':
      edges = [
        ...edges,
        { predecessorId: mutation.predecessorWpId, successorId: mutation.successorWpId },
      ];
      break;
    case 'remove_dependency':
      edges = edges.filter(
        (e) =>
          !(
            e.predecessorId === mutation.predecessorWpId &&
            e.successorId === mutation.successorWpId
          ),
      );
      break;
    default:
      break;
  }

  return { plan: { projectId: mutation.projectId, wps }, edges };
}

async function applyMutation(bound: Bound, mutation: PlanMutation): Promise<void> {
  const planInput = planInputRepositoryOn(bound);
  switch (mutation.kind) {
    case 'patch_duration':
      await planInput.patchDuration(mutation);
      return;
    case 'patch_constraint':
      await planInput.patchConstraint(mutation);
      return;
    case 'add_dependency':
      await planInput.addDependency(mutation);
      return;
    case 'remove_dependency':
      await planInput.removeDependency(mutation);
      return;
    case 're_lag_dependency':
      await planInput.reLagDependency(mutation);
      return;
  }
}

/**
 * Write one scheduling input and recalculate in the same transaction. Returns the new run.
 */
export async function applyPlanChange<Handle>(
  deps: ApplyPlanChangeDeps<Handle>,
  ctx: RequestContext,
  input: unknown,
): Promise<Result<RecalculateProjectResult>> {
  const roles = authorize(ctx, { roles: PROJECT_REACH_ROLES });
  if (!roles.ok) return roles;

  try {
    return await runAuditedWrite(
      planMutationSchema,
      deps,
      ctx,
      input,
      {
        at: (scope, command) => scope.projectWrite.projectAnchor(command.projectId),
        isNotFound: (error, command) => isProjectNotFound(error, command.projectId),
        authorize: (caller, command) =>
          authorize(caller, { roles: PROJECT_REACH_ROLES, projectId: command.projectId }),
      },
      async (scope, stamp: WriteStamp, mutation) => {
        const bound = asBound(scope.bound);

        const proposed = await proposedGraph(bound, mutation);
        const gate = checkPlanInvariants(proposed.plan, proposed.edges);
        if (!gate.ok) refuse(gate.error.code, gate.error.details);

        // Per-Project exclusive lock for the whole mutation + recalculation (AR-43 / AD-20).
        // Held for the rest of this tenant transaction; appendRun's lock is then a no-op.
        await lockWatermark(bound, { kind: 'project', projectId: mutation.projectId });

        try {
          await applyMutation(bound, mutation);
        } catch (error) {
          const mapped = mapSchedulingConstraint(error);
          if (mapped !== null) {
            refuse(
              'invalid_input',
              mapped.dependencies.length > 0 ? { dependencies: mapped.dependencies } : undefined,
            );
          }
          throw error;
        }

        const resolved = await resolveScheduleInputs(bound, mutation.projectId, stamp);
        const result = await recalculateProject({
          bound,
          projectId: mutation.projectId,
          cause: runCause(mutation),
          actor: stamp.actor,
          at: stamp.at,
          inputs: resolved.inputs,
          prevInputs: resolved.prevInputs,
          calendarVersionSeq: resolved.calendarVersionSeq,
          milestoneIds: resolved.milestoneIds,
          wpStatusSeqMax: resolved.wpStatusSeqMax,
          pctOverrideSeqMax: resolved.pctOverrideSeqMax,
        });

        await audit.record(scope, stamp, 'schedule.apply_plan_change', mutation.projectId, {
          kind: mutation.kind,
          runSeq: result.seq,
          haltedReason: result.haltedReason,
        });

        return result;
      },
    );
  } catch (error) {
    const mapped = mapSchedulingConstraint(error);
    if (mapped !== null) {
      return fail(
        'invalid_input',
        mapped.dependencies.length > 0 ? { dependencies: mapped.dependencies } : undefined,
      );
    }
    throw error;
  }
}
