/**
 * `setBaseline` — first Set Baseline (story 4.1, FR-15 / AR-22 / AR-9 / AR-11).
 *
 * Pins the latest successful `schedule_run` by FK reference (never copies inputs). Writes
 * leaf `baseline_wp` cost-projection rows from current-schema columns + run output dates.
 * Refuses incomplete plans, halted/missing runs, and a second Set (Re-baseline is 4.3).
 *
 * Outside the use-cases barrel — role/audit gates enumerate this module via the F10 second
 * list (`tests/schedule-calendar-writes.ts`). Append skeleton lives in
 * `append-baseline-version.ts` (Epic 4 retro F3).
 */
import { z } from 'zod';
import {
  authorize,
  PROJECT_REACH,
  PROJECT_REACH_ROLES,
  type RoleDeclaration,
} from '../authz/authorize';
import type { RequestContext } from '../authz/request-context';
import type { AuditDeclaration } from '../audit';
import { isProjectNotFound } from '../ports/project-read';
import type { WriteStamp } from '../ports/audited-write';
import type { IdGenerator } from '../ports/ids';
import type { Result } from '../result';
import { runAuditedWrite } from '../use-cases/audited-write';
import type { ApplyPlanChangeDeps } from '../schedule/apply-plan-change';
import { appendBaselineVersionWithLeaves } from './append-baseline-version';
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
      const landed = await appendBaselineVersionWithLeaves({
        bound: scope.bound,
        scope,
        stamp,
        ids: deps.ids,
        projectId: command.projectId,
        reason: FIRST_SET_REASON,
        auditAction: 'baseline.set',
        evaluateGates: evaluateBaselineSetGates,
      });
      return {
        baselineVersionSeq: landed.baselineVersionSeq,
        baselineVersionId: landed.baselineVersionId,
        scheduleRunSeq: landed.scheduleRunSeq,
        leafCount: landed.leafCount,
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
