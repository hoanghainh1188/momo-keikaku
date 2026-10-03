/**
 * `setBaseline` — first Set Baseline (story 4.1, FR-15 / AR-22 / AR-9 / AR-11).
 *
 * Pins the latest successful `schedule_run` by FK reference (never copies inputs). Writes
 * leaf `baseline_wp` cost-projection rows from current-schema columns + run output dates.
 * Refuses incomplete plans, halted/missing runs, and a second Set (Re-baseline is 4.3).
 *
 * Outside the use-cases barrel — role/audit gates enumerate this module via the F10 second
 * list (`tests/schedule-calendar-writes.ts`).
 */
import { z } from 'zod';
import type { Bound } from '../../../db/src/bound';
import { lockWatermark } from '../../../db/src/watermark-lock';
import { baselineRepositoryOn } from '../../../db/src/repositories/baseline';
import { scheduleRepositoryOn } from '../../../db/src/repositories/schedule';
import {
  authorize,
  PROJECT_REACH,
  PROJECT_REACH_ROLES,
  type RoleDeclaration,
} from '../authz/authorize';
import type { RequestContext } from '../authz/request-context';
import { audit, type AuditDeclaration } from '../audit';
import { isProjectNotFound } from '../ports/project-read';
import type { WriteStamp } from '../ports/audited-write';
import type { IdGenerator } from '../ports/ids';
import type { SchedulingBound } from '../ports/schedule-write';
import type { Result } from '../result';
import { refuse, runAuditedWrite } from '../use-cases/audited-write';
import type { ApplyPlanChangeDeps } from '../schedule/apply-plan-change';
import { evaluateBaselineSetGates } from './gates';

/** Fixed first-set reason — free-text mandatory reason is story 4.3. */
export const FIRST_SET_REASON = 'Initial Baseline';

const noNul = (value: string) => !value.includes('\0');
const id = z.string().min(1).refine(noNul, 'must not contain a NUL character');

const setBaselineSchema = z.object({
  projectId: id,
});

export type SetBaselineDeps<Handle> = ApplyPlanChangeDeps<Handle> & {
  readonly ids: IdGenerator;
};

export type SetBaselineResult = {
  readonly baselineVersionSeq: number;
  readonly baselineVersionId: string;
  readonly scheduleRunSeq: number;
  readonly leafCount: number;
};

function asBound(bound: SchedulingBound): Bound {
  return bound as Bound;
}

/**
 * First Set Baseline for a Project. Authorises PROJECT_REACH, refuses incomplete / halted /
 * second-set, locks the Project watermark, inserts version + leaf rows, audits `baseline.set`.
 */
export async function setBaseline<Handle>(
  deps: SetBaselineDeps<Handle>,
  ctx: RequestContext,
  input: unknown,
): Promise<Result<SetBaselineResult>> {
  const roles = authorize(ctx, { roles: PROJECT_REACH_ROLES });
  if (!roles.ok) return roles;

  return runAuditedWrite(
    setBaselineSchema,
    deps,
    ctx,
    input,
    {
      at: (scope, command) => scope.projectWrite.projectAnchor(command.projectId),
      isNotFound: (error, command) => isProjectNotFound(error, command.projectId),
      authorize: (caller, command) =>
        authorize(caller, { roles: PROJECT_REACH_ROLES, projectId: command.projectId }),
    },
    async (scope, stamp, command) => {
      const bound = asBound(scope.bound);
      const baseline = baselineRepositoryOn(bound);
      const schedule = scheduleRepositoryOn(bound);

      const loadGateInput = async () => {
        const [projectStart, existingSeq, latestRun, successfulRun, leaves] = await Promise.all([
          baseline.projectStart(command.projectId),
          baseline.latestVersionSeq(command.projectId),
          schedule.latestRun(command.projectId),
          schedule.latestSuccessfulRun(command.projectId),
          baseline.loadLeafProjections(command.projectId),
        ]);
        return { projectStart, existingSeq, latestRun, successfulRun, leaves };
      };

      // Long reads before the exclusive lock (AD-20) — early refuse without holding it.
      const early = await loadGateInput();
      const earlyGate = evaluateBaselineSetGates({
        projectStart: early.projectStart,
        existingBaselineSeq: early.existingSeq,
        latestRun: early.latestRun,
        successfulRun: early.successfulRun,
        leaves: early.leaves,
      });
      if (!earlyGate.ok) {
        refuse('invalid_input', earlyGate.details);
      }

      // AD-20: exclusive Project lock, then re-read + re-gate (closes concurrent first-Set TOCTOU).
      await lockWatermark(bound, { kind: 'project', projectId: command.projectId });

      const locked = await loadGateInput();
      const gate = evaluateBaselineSetGates({
        projectStart: locked.projectStart,
        existingBaselineSeq: locked.existingSeq,
        latestRun: locked.latestRun,
        successfulRun: locked.successfulRun,
        leaves: locked.leaves,
      });
      if (!gate.ok) {
        refuse('invalid_input', gate.details);
      }
      const { scheduleRunSeq, leafDates } = gate;
      const leaves = locked.leaves;

      const versionId = deps.ids.next();
      const wpRows = leaves.map((leaf) => {
        const dates = leafDates.get(leaf.wpId);
        if (dates === undefined) {
          refuse('invalid_input', {
            baseline: ['incomplete_plan'],
            blockingWpIds: [leaf.wpId],
          });
        }
        return {
          id: deps.ids.next(),
          wpId: leaf.wpId,
          start: dates.start,
          finish: dates.finish,
          baselineMh: leaf.plannedMh,
          isMilestone: leaf.isMilestone,
          isCatchAll: leaf.isCatchAll,
        };
      });

      const { seq } = await baseline.appendVersionWithWps(
        {
          projectId: command.projectId,
          id: versionId,
          scheduleRunSeq,
          reason: FIRST_SET_REASON,
          actor: stamp.actor,
          at: stamp.at,
        },
        wpRows,
      );

      await audit.record(scope, stamp, 'baseline.set', command.projectId, {
        baselineVersionSeq: seq,
        baselineVersionId: versionId,
        scheduleRunSeq,
        leafCount: wpRows.length,
        reason: FIRST_SET_REASON,
      });

      return {
        baselineVersionSeq: seq,
        baselineVersionId: versionId,
        scheduleRunSeq,
        leafCount: wpRows.length,
      };
    },
  );
}

/** Declared for the audit gate (`tests/audited-use-cases.test.ts`). */
export const SET_BASELINE_AUDIT = {
  setBaseline: { audited: ['baseline.set'] },
} as const satisfies Readonly<Record<string, AuditDeclaration>>;

/** Role declarations for the Baseline writer (colocated — see `use-cases/role-declarations.ts`). */
export const SET_BASELINE_ROLES = {
  setBaseline: PROJECT_REACH,
} as const satisfies Readonly<Record<string, RoleDeclaration>>;

/** Re-export stamp type for tests that mirror fence patterns. */
export type { WriteStamp };
