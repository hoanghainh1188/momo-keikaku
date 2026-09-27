/**
 * THE ONE FENCE (stories 2.9 / 2.10 / 2.11, AR-43 / AD-25 / AD-27):
 * `applyPlanChange(ctx, mutation)` writes a scheduling / plan input and recalculates in one
 * tenant transaction under the per-Project exclusive lock.
 *
 * Closed mutation union: duration / constraint / dependency patches (2.9), WP authoring,
 * actuals, Recorded %, Custom Fields, and the actuals+Data Date compound (2.10), plus the
 * three Project schedule settings (2.11). `checkPlanInvariants` runs before every write;
 * 23503/23514 map to `invalid_input`. Clearing Project start skips recalculation (Q2→A).
 */
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { projectDate, type PlanGraphEdge, type PlanGraphWp, type ScheduleRunCause } from '@momo/domain';
import type { Bound } from '../../../db/src/bound';
import { lockWatermark } from '../../../db/src/watermark-lock';
import { planInputRepositoryOn } from '../../../db/src/repositories/plan-input';
import { scheduleRepositoryOn } from '../../../db/src/repositories/schedule';
import * as s from '../../../db/src/schema';
import { authorize, PROJECT_REACH_ROLES } from '../authz/authorize';
import type { RequestContext } from '../authz/request-context';
import { audit, type AuditSink } from '../audit';
import { isProjectNotFound } from '../ports/project-read';
import { projectNotFound } from '../../../db/src/project-not-found';
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
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const leafResolutionSchema = z.discriminatedUnion('strategy', [
  z.object({ strategy: z.literal('drop') }),
  z.object({ strategy: z.literal('move_to_child'), childWpId: id }),
]);

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
  z.object({
    kind: z.literal('create_wp'),
    projectId: id,
    wpId: id,
    parentId: id.nullable(),
    wbsCode: z.string().min(1),
    name: z.string().min(1).refine(noNul),
    durationDays: z.number().int().nonnegative().nullable().optional(),
    plannedMh: z.bigint().optional(),
    assignedResourceIds: z.array(id).optional(),
    isMilestone: z.boolean().optional(),
    constraintType: z.enum(['asap', 'must_start_on', 'must_finish_on']).optional(),
    constraintDate: z.string().nullable().optional(),
    leafResolution: leafResolutionSchema.optional(),
  }),
  z.object({
    kind: z.literal('delete_wp'),
    projectId: id,
    wpId: id,
  }),
  z.object({
    kind: z.literal('reparent_wp'),
    projectId: id,
    wpId: id,
    newParentId: id.nullable(),
    leafResolution: leafResolutionSchema.optional(),
  }),
  z.object({
    kind: z.literal('patch_wp_name'),
    projectId: id,
    wpId: id,
    name: z.string().min(1).refine(noNul),
  }),
  z.object({
    kind: z.literal('patch_effort'),
    projectId: id,
    wpId: id,
    plannedMh: z.bigint(),
  }),
  z.object({
    kind: z.literal('patch_resources'),
    projectId: id,
    wpId: id,
    assignedResourceIds: z.array(id),
  }),
  z.object({
    kind: z.literal('patch_milestone'),
    projectId: id,
    wpId: id,
    isMilestone: z.boolean(),
  }),
  z.object({
    kind: z.literal('patch_actual_dates'),
    projectId: id,
    wpId: id,
    actualStart: isoDate.nullable(),
    actualFinish: isoDate.nullable(),
    source: z.enum(['typed', 'imported', 'accepted-from-proposal']),
    /** When actual finish is after Data Date, PM must confirm the new Data Date. */
    advanceDataDate: isoDate.optional(),
  }),
  z.object({
    kind: z.literal('patch_recorded_pct'),
    projectId: id,
    wpId: id,
    recordedPctNum: z.bigint(),
    recordedPctDen: z.bigint(),
  }),
  z.object({
    kind: z.literal('create_custom_field_definition'),
    projectId: id,
    definitionId: id,
    name: z.string().min(1).refine(noNul),
    fieldType: z.enum(['text', 'number', 'date', 'single_select']),
    options: z.array(z.string()).optional(),
    ordinal: z.number().int().nonnegative().optional(),
  }),
  z.object({
    kind: z.literal('set_custom_field_value'),
    projectId: id,
    wpId: id,
    definitionId: id,
    textValue: z.string().nullable().optional(),
    numberValue: z.bigint().nullable().optional(),
    dateValue: isoDate.nullable().optional(),
    selectValue: z.string().nullable().optional(),
  }),
  z.object({
    kind: z.literal('set_project_start'),
    projectId: id,
    projectStart: isoDate,
    /** Omit to default to today in the Project tz (FR-43). */
    dataDate: isoDate.optional(),
  }),
  z.object({
    kind: z.literal('clear_project_start'),
    projectId: id,
  }),
  z.object({
    kind: z.literal('patch_project_finish'),
    projectId: id,
    projectFinish: isoDate.nullable(),
  }),
  z.object({
    kind: z.literal('patch_data_date'),
    projectId: id,
    dataDate: isoDate,
  }),
]);

/** asap ⇔ null date; must_* ⇔ non-null date. Finish-before-start refused for actuals. */
export const planMutationSchema = planMutationBase.superRefine((value, ctx) => {
  if (value.kind === 'patch_constraint' || value.kind === 'create_wp') {
    const constraintFieldsPresent =
      value.kind === 'patch_constraint' ||
      value.constraintType !== undefined ||
      value.constraintDate !== undefined;
    if (constraintFieldsPresent) {
      const constraintType =
        value.kind === 'patch_constraint'
          ? value.constraintType
          : (value.constraintType ?? 'asap');
      const constraintDate =
        value.kind === 'patch_constraint'
          ? value.constraintDate
          : value.constraintDate !== undefined
            ? value.constraintDate
            : null;
      const asap = constraintType === 'asap';
      const nullDate = constraintDate === null;
      if (asap !== nullDate) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['constraintDate'],
          message: asap
            ? 'asap requires a null constraintDate'
            : 'must_start_on / must_finish_on require a constraintDate',
        });
      }
    }
  }
  if (value.kind === 'patch_actual_dates') {
    if (
      value.actualStart !== null &&
      value.actualFinish !== null &&
      value.actualFinish < value.actualStart
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['actualFinish'],
        message: 'actual finish must not be before actual start',
      });
    }
  }
  if (value.kind === 'patch_recorded_pct') {
    if (value.recordedPctDen === 0n) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['recordedPctDen'],
        message: 'denominator must not be zero',
      });
    } else {
      // Compare in integers: 0 ≤ num/den ≤ 1 ⇔ 0 ≤ num*sign(den) ≤ |den| when same sign.
      const num = value.recordedPctNum;
      const den = value.recordedPctDen;
      const absDen = den < 0n ? -den : den;
      const scaled = den < 0n ? -num : num;
      if (scaled < 0n || scaled > absDen) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['recordedPctNum'],
          message: 'recorded pct must be in [0, 1]',
        });
      }
    }
  }
});

export type PlanMutation = z.infer<typeof planMutationBase>;

export type ApplyPlanChangeScope = {
  readonly bound: SchedulingBound;
  readonly projectWrite: { readonly projectAnchor: (projectId: string) => Promise<Date> };
  readonly audit: AuditSink;
};

export type ApplyPlanChangeDeps<Handle> = AuditedWriteDeps<Handle, ApplyPlanChangeScope>;

export type ApplyPlanChangeResult = RecalculateProjectResult & {
  readonly warnings?: readonly string[];
};

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
    case 'create_wp':
      return 'wp_created';
    case 'delete_wp':
      return 'wp_deleted';
    case 'reparent_wp':
      return 'wp_moved';
    case 'patch_wp_name':
    case 'patch_effort':
    case 'patch_resources':
    case 'patch_milestone':
    case 'create_custom_field_definition':
    case 'set_custom_field_value':
      return 'plan_edit';
    case 'patch_actual_dates':
      return mutation.advanceDataDate !== undefined ? 'data_date' : 'actual_dates';
    case 'patch_recorded_pct':
      return 'progress';
    case 'set_project_start':
    case 'clear_project_start':
    case 'patch_project_finish':
      return 'project_dates';
    case 'patch_data_date':
      return 'data_date';
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
  let wps: PlanGraphWp[] = rows.wps.map((w) => ({
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
    case 'create_wp':
      wps = [
        ...wps,
        {
          id: mutation.wpId,
          wbsCode: mutation.wbsCode,
          projectId: mutation.projectId,
          parentId: mutation.parentId,
        },
      ];
      break;
    case 'delete_wp':
      wps = wps.filter((w) => w.id !== mutation.wpId);
      edges = edges.filter(
        (e) => e.predecessorId !== mutation.wpId && e.successorId !== mutation.wpId,
      );
      // Orphan children would fail invariants — soft-delete of a summary with live children is
      // refused by the writer / invariants when they remain pointing at a deleted parent.
      wps = wps.map((w) =>
        w.parentId === mutation.wpId ? { ...w, parentId: null } : w,
      );
      break;
    case 'reparent_wp':
      wps = wps.map((w) =>
        w.id === mutation.wpId ? { ...w, parentId: mutation.newParentId } : w,
      );
      break;
    default:
      break;
  }

  return { plan: { projectId: mutation.projectId, wps }, edges };
}

async function applyMutation(
  bound: Bound,
  mutation: PlanMutation,
  stamp: WriteStamp,
): Promise<readonly string[]> {
  const planInput = planInputRepositoryOn(bound);
  const warnings: string[] = [];

  switch (mutation.kind) {
    case 'patch_duration': {
      // F21: a milestone must stay at duration 0 — refuse non-zero / null (idempotent 0 OK).
      const [wp] = await bound.tx
        .select({
          isMilestone: s.workPackage.isMilestone,
          deletedAt: s.workPackage.deletedAt,
        })
        .from(s.workPackage)
        .where(
          and(
            eq(s.workPackage.tenantId, bound.tenantId),
            eq(s.workPackage.projectId, mutation.projectId),
            eq(s.workPackage.id, mutation.wpId),
          ),
        );
      if (wp !== undefined && wp.deletedAt === null && wp.isMilestone && mutation.durationDays !== 0) {
        refuse('invalid_input', { durationDays: ['milestone_must_be_zero'] });
      }
      await planInput.patchDuration(mutation);
      return warnings;
    }
    case 'patch_constraint':
      await planInput.patchConstraint(mutation);
      return warnings;
    case 'add_dependency':
      await planInput.addDependency(mutation);
      return warnings;
    case 'remove_dependency':
      await planInput.removeDependency(mutation);
      return warnings;
    case 're_lag_dependency':
      await planInput.reLagDependency(mutation);
      return warnings;
    case 'create_wp': {
      // F21: milestone ↔ duration pairing — refuse multi-day; coerce omitted/null → 0.
      const isMilestone = mutation.isMilestone ?? false;
      if (isMilestone) {
        const raw = mutation.durationDays;
        if (raw !== undefined && raw !== null && raw !== 0) {
          refuse('invalid_input', { durationDays: ['milestone_must_be_zero'] });
        }
        await planInput.createWp({ ...mutation, isMilestone: true, durationDays: 0 });
        return warnings;
      }
      await planInput.createWp(mutation);
      return warnings;
    }
    case 'delete_wp':
      await planInput.softDeleteWp({
        projectId: mutation.projectId,
        wpId: mutation.wpId,
        deletedAt: stamp.at,
      });
      return warnings;
    case 'reparent_wp':
      await planInput.reparentWp(mutation);
      return warnings;
    case 'patch_wp_name':
      await planInput.patchWpName(mutation);
      return warnings;
    case 'patch_effort':
      await planInput.patchEffort(mutation);
      return warnings;
    case 'patch_resources':
      await planInput.patchResources(mutation);
      return warnings;
    case 'patch_milestone':
      // F21 / Q1→C: true coerces duration to 0; false clears duration to null (repo write).
      await planInput.patchMilestone(mutation);
      return warnings;
    case 'patch_actual_dates': {
      const schedule = scheduleRepositoryOn(bound);
      const plan = await schedule.loadPlanRows(mutation.projectId);
      const currentDataDate = plan.project.dataDate ?? stamp.at.toISOString().slice(0, 10);
      const finish = mutation.actualFinish;
      if (finish !== null && finish > currentDataDate) {
        if (mutation.advanceDataDate === undefined) {
          refuse('invalid_input', { advanceDataDate: ['required'] });
        }
        if (mutation.advanceDataDate < finish) {
          refuse('invalid_input', { advanceDataDate: ['must_cover_actual_finish'] });
        }
        await planInput.patchDataDate({
          projectId: mutation.projectId,
          dataDate: mutation.advanceDataDate,
        });
      }
      await planInput.appendStatusEvent({
        projectId: mutation.projectId,
        wpId: mutation.wpId,
        actualStart: mutation.actualStart,
        actualFinish: mutation.actualFinish,
        source: mutation.source,
        actor: stamp.actor,
        at: stamp.at,
      });
      return warnings;
    }
    case 'patch_recorded_pct':
      await planInput.appendPctOverride({
        projectId: mutation.projectId,
        wpId: mutation.wpId,
        recordedPctNum: mutation.recordedPctNum,
        recordedPctDen: mutation.recordedPctDen,
        actor: stamp.actor,
        at: stamp.at,
      });
      return warnings;
    case 'create_custom_field_definition': {
      const count = await planInput.countCustomFieldDefinitions(mutation.projectId);
      if (count >= 100) {
        warnings.push('custom_field_definition_untested_bound');
      }
      await planInput.createCustomFieldDefinition(mutation);
      return warnings;
    }
    case 'set_custom_field_value':
      await planInput.setCustomFieldValue(mutation);
      return warnings;
    case 'set_project_start': {
      const [project] = await bound.tx
        .select({
          tzOffsetMinutes: s.project.tzOffsetMinutes,
          projectStart: s.project.projectStart,
          dataDate: s.project.dataDate,
        })
        .from(s.project)
        .where(and(eq(s.project.tenantId, bound.tenantId), eq(s.project.id, mutation.projectId)));
      if (!project) throw projectNotFound(mutation.projectId);

      // First set: Data Date defaults to today (project tz). Re-set with an existing Data Date
      // leaves it alone unless the caller supplies an explicit dataDate (do not clobber advances).
      const writingDataDate =
        mutation.dataDate !== undefined
          ? mutation.dataDate
          : project.dataDate === null
            ? projectDate(stamp.at.toISOString(), project.tzOffsetMinutes)
            : null;

      if (writingDataDate !== null) {
        const blockers = await planInput.dataDateBlockers(mutation.projectId, writingDataDate);
        if (blockers.length > 0) {
          refuse('invalid_input', {
            dataDate: ['before_latest_actual_finish'],
            blockingWpIds: blockers.map((b) => b.wpId),
          });
        }
      }

      await planInput.patchProjectStart({
        projectId: mutation.projectId,
        projectStart: mutation.projectStart,
        ...(writingDataDate !== null ? { dataDate: writingDataDate } : {}),
      });
      return warnings;
    }
    case 'clear_project_start':
      await planInput.patchProjectStart({
        projectId: mutation.projectId,
        projectStart: null,
      });
      return warnings;
    case 'patch_project_finish': {
      const [project] = await bound.tx
        .select({ projectStart: s.project.projectStart })
        .from(s.project)
        .where(and(eq(s.project.tenantId, bound.tenantId), eq(s.project.id, mutation.projectId)));
      if (!project) throw projectNotFound(mutation.projectId);
      if (project.projectStart === null) {
        refuse('invalid_input', { projectStart: ['required'] });
      }
      await planInput.patchProjectFinish({
        projectId: mutation.projectId,
        projectFinish: mutation.projectFinish,
      });
      return warnings;
    }
    case 'patch_data_date': {
      const [project] = await bound.tx
        .select({ projectStart: s.project.projectStart })
        .from(s.project)
        .where(and(eq(s.project.tenantId, bound.tenantId), eq(s.project.id, mutation.projectId)));
      if (!project) throw projectNotFound(mutation.projectId);
      if (project.projectStart === null) {
        refuse('invalid_input', { projectStart: ['required'] });
      }
      const blockers = await planInput.dataDateBlockers(mutation.projectId, mutation.dataDate);
      if (blockers.length > 0) {
        refuse('invalid_input', {
          dataDate: ['before_latest_actual_finish'],
          blockingWpIds: blockers.map((b) => b.wpId),
        });
      }
      await planInput.patchDataDate({
        projectId: mutation.projectId,
        dataDate: mutation.dataDate,
      });
      return warnings;
    }
  }
}

/**
 * Write one scheduling / plan input and recalculate in the same transaction. Returns the new run.
 */
export async function applyPlanChange<Handle>(
  deps: ApplyPlanChangeDeps<Handle>,
  ctx: RequestContext,
  input: unknown,
): Promise<Result<ApplyPlanChangeResult>> {
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

        const [beforeSettings] = await bound.tx
          .select({
            projectStart: s.project.projectStart,
            projectFinish: s.project.projectFinish,
            dataDate: s.project.dataDate,
          })
          .from(s.project)
          .where(
            and(eq(s.project.tenantId, bound.tenantId), eq(s.project.id, mutation.projectId)),
          );

        const proposed = await proposedGraph(bound, mutation);
        const gate = checkPlanInvariants(proposed.plan, proposed.edges);
        if (!gate.ok) refuse(gate.error.code, gate.error.details);

        // Per-Project exclusive lock for the whole mutation + recalculation (AR-43 / AD-20).
        // Held for the rest of this tenant transaction; appendRun's lock is then a no-op.
        await lockWatermark(bound, { kind: 'project', projectId: mutation.projectId });

        let warnings: readonly string[] = [];
        try {
          warnings = await applyMutation(bound, mutation, stamp);
        } catch (error) {
          if (
            error instanceof Error &&
            (error as { code?: string }).code === 'leaf_resolution_required'
          ) {
            refuse('invalid_input', { leafResolution: ['required'] });
          }
          if (
            error instanceof Error &&
            (error as { code?: string }).code === 'wp_has_children'
          ) {
            refuse('invalid_input', { wpId: ['has_children'] });
          }
          if (
            error instanceof Error &&
            (error as { code?: string }).code === 'child_not_found'
          ) {
            refuse('invalid_input', { leafResolution: ['child_not_found'] });
          }
          if (
            error instanceof Error &&
            ((error as { code?: string }).code === 'cf_value_type_mismatch' ||
              (error as { code?: string }).code === 'cf_option_invalid')
          ) {
            const code = (error as { code?: string }).code ?? 'cf_value_type_mismatch';
            refuse('invalid_input', {
              customField: [code],
            });
          }
          const mapped = mapSchedulingConstraint(error);
          if (mapped !== null) {
            refuse(
              'invalid_input',
              mapped.dependencies.length > 0 ? { dependencies: mapped.dependencies } : undefined,
            );
          }
          throw error;
        }

        const settingsKinds = new Set([
          'set_project_start',
          'clear_project_start',
          'patch_project_finish',
          'patch_data_date',
        ]);
        const settingsAudit =
          settingsKinds.has(mutation.kind) && beforeSettings !== undefined
            ? await (async () => {
                const [after] = await bound.tx
                  .select({
                    projectStart: s.project.projectStart,
                    projectFinish: s.project.projectFinish,
                    dataDate: s.project.dataDate,
                  })
                  .from(s.project)
                  .where(
                    and(
                      eq(s.project.tenantId, bound.tenantId),
                      eq(s.project.id, mutation.projectId),
                    ),
                  );
                return {
                  before: {
                    projectStart: beforeSettings.projectStart,
                    projectFinish: beforeSettings.projectFinish,
                    dataDate: beforeSettings.dataDate,
                  },
                  after: {
                    projectStart: after?.projectStart ?? null,
                    projectFinish: after?.projectFinish ?? null,
                    dataDate: after?.dataDate ?? null,
                  },
                };
              })()
            : undefined;

        // Q2→A: clearing Project start restores "no project start yet" — FR-6b does not run.
        if (mutation.kind === 'clear_project_start') {
          await audit.record(scope, stamp, 'schedule.apply_plan_change', mutation.projectId, {
            kind: mutation.kind,
            runSeq: null,
            haltedReason: null,
            ...(settingsAudit !== undefined ? settingsAudit : {}),
            ...(warnings.length > 0 ? { warnings } : {}),
          });
          return {
            seq: null,
            kind: 'cleared' as const,
            haltedReason: null,
            outputs: null,
          };
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
          ...(settingsAudit !== undefined ? settingsAudit : {}),
          ...(warnings.length > 0 ? { warnings } : {}),
        });

        return warnings.length > 0 ? { ...result, warnings } : result;
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
