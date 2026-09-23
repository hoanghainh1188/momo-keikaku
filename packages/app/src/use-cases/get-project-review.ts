import { PROJECT_REACH, type RoleDeclaration } from '../authz/authorize';
import type { Result } from '../result';
import type { ProjectReadDeps, ProjectReview } from '../ports/project-read';
import type { RequestContext } from '../authz/request-context';
import { runProjectRead, type ProjectInput } from './project-input';

/**
 * The Project bundle and the Reconciliation Review computed over it — what the Review, Plan,
 * Mapping, Baselines and Connectors pages render. With no Baseline the Review is partial, not
 * an error (story 2.2, decision Q1-A): its EVM, forecast, milestones and divergence are null.
 *
 * Same contract as `getProjectHeader`: `not_found` for a Project that does not exist or is
 * another Tenant's, `invalid_input` for an empty or absent `projectId`, and every other
 * failure propagates rather than being turned into an empty Review.
 */
export async function getProjectReview<Handle>(
  deps: ProjectReadDeps<Handle>,
  ctx: RequestContext,
  input: ProjectInput,
): Promise<Result<ProjectReview>> {
  return runProjectRead(ctx, input, (tenantId, projectId) =>
    deps.projectRead.loadReview(deps.handle, tenantId, projectId),
  );
}

/** Role declaration for this use case (colocated — see `role-declarations.ts`). */
export const GET_PROJECT_REVIEW_ROLES = {
  getProjectReview: PROJECT_REACH,
} as const satisfies Readonly<Record<string, RoleDeclaration>>;
