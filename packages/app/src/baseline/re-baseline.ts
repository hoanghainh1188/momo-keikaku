/**
 * `reBaseline` — Re-baseline with a mandatory free-text reason (story 4.3, FR-16 / AR-9 /
 * AR-37 / NFR-A1).
 *
 * Requires an existing Baseline. Same pin / refuse / retention / `appendVersionWithWps` path as
 * first Set under the AD-20 Project lock. Appends a new version; never UPDATE/DELETE. Audits
 * `baseline.rebaseline`. Outside the use-cases barrel — F10 second module list.
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
import type { IdGenerator } from '../ports/ids';
import type { SchedulingBound } from '../ports/schedule-write';
import type { Result } from '../result';
import { refuse, runAuditedWrite } from '../use-cases/audited-write';
import type { ApplyPlanChangeDeps } from '../schedule/apply-plan-change';
import { evaluateReBaselineGates } from './gates';

const noNul = (value: string) => !value.includes('\0');
const id = z.string().min(1).refine(noNul, 'must not contain a NUL character');

const reBaselineSchema = z.object({
  projectId: id,
  reason: z.string().refine(noNul, 'must not contain a NUL character'),
});

export type ReBaselineDeps<Handle> = ApplyPlanChangeDeps<Handle> & {
  readonly ids: IdGenerator;
};

export type ReBaselineResult = {
  readonly baselineVersionSeq: number;
  readonly baselineVersionId: string;
  readonly scheduleRunSeq: number;
  readonly leafCount: number;
  readonly reason: string;
};

function asBound(bound: SchedulingBound): Bound {
  return bound as Bound;
}

/**
 * Re-baseline a Project that already has a Baseline. Authorises PROJECT_REACH, refuses blank
 * reason / no-baseline / incomplete / halted, locks the Project watermark, appends version +
 * leaf rows, audits `baseline.rebaseline`.
 */
export async function reBaseline<Handle>(
  deps: ReBaselineDeps<Handle>,
  ctx: RequestContext,
  input: unknown,
): Promise<Result<ReBaselineResult>> {
  const roles = authorize(ctx, { roles: PROJECT_REACH_ROLES });
  if (!roles.ok) return roles;

  return runAuditedWrite(
    reBaselineSchema,
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
      const reason = command.reason.trim();
      if (reason === '') {
        refuse('invalid_input', { reason: ['required'] });
      }

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
      const earlyGate = evaluateReBaselineGates({
        projectStart: early.projectStart,
        existingBaselineSeq: early.existingSeq,
        latestRun: early.latestRun,
        successfulRun: early.successfulRun,
        leaves: early.leaves,
      });
      if (!earlyGate.ok) {
        refuse('invalid_input', earlyGate.details);
      }

      // AD-20: exclusive Project lock, then re-read + re-gate (closes concurrent TOCTOU).
      await lockWatermark(bound, { kind: 'project', projectId: command.projectId });

      const locked = await loadGateInput();
      const gate = evaluateReBaselineGates({
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
          reason,
          actor: stamp.actor,
          at: stamp.at,
        },
        wpRows,
      );

      await audit.record(scope, stamp, 'baseline.rebaseline', command.projectId, {
        baselineVersionSeq: seq,
        baselineVersionId: versionId,
        scheduleRunSeq,
        leafCount: wpRows.length,
        reason,
      });

      return {
        baselineVersionSeq: seq,
        baselineVersionId: versionId,
        scheduleRunSeq,
        leafCount: wpRows.length,
        reason,
      };
    },
  );
}

/** Declared for the audit gate (`tests/audited-use-cases.test.ts`). */
export const RE_BASELINE_AUDIT = {
  reBaseline: { audited: ['baseline.rebaseline'] },
} as const satisfies Readonly<Record<string, AuditDeclaration>>;

/** Role declarations for the Re-baseline writer (colocated — see `use-cases/role-declarations.ts`). */
export const RE_BASELINE_ROLES = {
  reBaseline: PROJECT_REACH,
} as const satisfies Readonly<Record<string, RoleDeclaration>>;
