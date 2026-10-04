/**
 * `reBaseline` — Re-baseline with a mandatory free-text reason (story 4.3, FR-16 / AR-9 /
 * AR-37 / NFR-A1).
 *
 * Requires an existing Baseline. Same pin / refuse / retention / `appendVersionWithWps` path as
 * first Set under the AD-20 Project lock. Appends a new version; never UPDATE/DELETE. Audits
 * `baseline.rebaseline`. Outside the use-cases barrel — F10 second module list.
 * Append skeleton lives in `append-baseline-version.ts` (Epic 4 retro F3).
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
import type { IdGenerator } from '../ports/ids';
import type { Result } from '../result';
import { refuse, runAuditedWrite } from '../use-cases/audited-write';
import type { ApplyPlanChangeDeps } from '../schedule/apply-plan-change';
import { appendBaselineVersionWithLeaves } from './append-baseline-version';
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

      return appendBaselineVersionWithLeaves({
        bound: scope.bound,
        scope,
        stamp,
        ids: deps.ids,
        projectId: command.projectId,
        reason,
        auditAction: 'baseline.rebaseline',
        evaluateGates: evaluateReBaselineGates,
      });
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
