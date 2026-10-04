/**
 * Re-derive the latest Baseline's pinned `schedule_run` (story 4.2, FR-15 / AR-22 / AR-35).
 *
 * Loads Baseline pin → `runBySeq` → optional prev by `prev_run_seq` → domain `reDeriveStoredRun`.
 * Never calls `resolveScheduleInputs` / Current Plan builders / `latestRun` for gate inputs.
 * Read-only — no audit action (F10 surface, Epic 4 retro F7 / item-21).
 */
import { reDeriveStoredRun, type ReDeriveResult } from '@momo/domain';
import type { Bound } from '../../../db/src/bound';
import { baselineRepositoryOn } from '../../../db/src/repositories/baseline';
import { scheduleRepositoryOn } from '../../../db/src/repositories/schedule';
import type { AuditDeclaration } from '../audit';
import {
  authorize,
  PROJECT_REACH,
  PROJECT_REACH_ROLES,
  type RoleDeclaration,
} from '../authz/authorize';
import type { RequestContext } from '../authz/request-context';
import { isProjectNotFound } from '../ports/project-read';
import type { SchedulingBound } from '../ports/schedule-write';
import { fail, ok, type Result } from '../result';
import type { ApplyPlanChangeDeps } from '../schedule/apply-plan-change';

export type ReDerivePinnedBaselineResult = {
  readonly projectId: string;
  readonly pinnedScheduleRunSeq: number;
  readonly prevRunSeq: number | null;
  readonly engineVersion: string;
  readonly gate: ReDeriveResult;
};

function asBound(bound: SchedulingBound): Bound {
  return bound as Bound;
}

/**
 * Authorised re-derivation of the Project's latest Baseline pin.
 * Returns `invalid_input` when there is no Baseline, the pin row is missing, the pin is
 * incomplete, or the gate fails (`mismatch` / `engine_halted`).
 */
export async function reDerivePinnedBaseline<Handle>(
  deps: ApplyPlanChangeDeps<Handle>,
  ctx: RequestContext,
  input: { readonly projectId: string },
): Promise<Result<ReDerivePinnedBaselineResult>> {
  const roles = authorize(ctx, { roles: PROJECT_REACH_ROLES, projectId: input.projectId });
  if (!roles.ok) return roles;

  try {
    return await deps.transaction(deps.handle, ctx.tenantId, async (scope) => {
      const bound = asBound(scope.bound);
      const baseline = baselineRepositoryOn(bound);
      const schedule = scheduleRepositoryOn(bound);

      const pinSeq = await baseline.latestPinnedScheduleRunSeq(input.projectId);
      if (pinSeq === null) {
        return fail('invalid_input', { baseline: ['no_baseline'] });
      }

      const run = await schedule.runBySeq(input.projectId, pinSeq);
      if (run === null) {
        return fail('invalid_input', {
          pin: [`missing_schedule_run_seq_${pinSeq}`],
        });
      }

      let prevInputs: unknown | null = null;
      if (run.prevRunSeq !== null) {
        const prev = await schedule.runBySeq(input.projectId, run.prevRunSeq);
        if (prev === null) {
          return fail('invalid_input', {
            pin: [`missing_prev_run_seq_${run.prevRunSeq}`],
          });
        }
        prevInputs = prev.inputs;
      }

      const gate = reDeriveStoredRun({
        engineVersion: run.engineVersion,
        inputs: run.inputs,
        outputs: run.outputs,
        prevInputs,
        haltedReason: run.haltedReason,
      });

      if (!gate.ok) {
        return fail('invalid_input', {
          pin: [gate.reason, gate.message],
        });
      }

      return ok({
        projectId: input.projectId,
        pinnedScheduleRunSeq: run.seq,
        prevRunSeq: run.prevRunSeq,
        engineVersion: run.engineVersion,
        gate,
      });
    });
  } catch (error) {
    if (isProjectNotFound(error, input.projectId)) return fail('not_found');
    throw error;
  }
}

/** Role declaration for the pin re-derive reader (colocated — see `use-cases/role-declarations.ts`). */
export const RE_DERIVE_PINNED_BASELINE_ROLES = {
  reDerivePinnedBaseline: PROJECT_REACH,
} as const satisfies Readonly<Record<string, RoleDeclaration>>;

/** Read-only — no NFR-A1 write action (see `UNAUDITED_BY_DECISION` in the audit gate). */
export const RE_DERIVE_PINNED_BASELINE_AUDIT = {
  reDerivePinnedBaseline: {
    unaudited: 'read-only pin re-derive; no rows written',
  },
} as const satisfies Readonly<Record<string, AuditDeclaration>>;
