import type { Result } from '../result';
import type { ProjectReadDeps, ProjectReview } from '../ports/project-read';
import type { UseCaseContext } from './context';
import { runProjectRead, type ProjectInput } from './project-input';

/**
 * The Project bundle and the Reconciliation Review computed over it — what the Review, Plan,
 * Mapping, Baselines, Connectors and Client View pages render.
 *
 * Same contract as `getProjectHeader`: `not_found` for a Project that does not exist or is
 * another Tenant's, `invalid_input` for an empty or absent `projectId`, and every other
 * failure propagates rather than being turned into an empty Review.
 */
export async function getProjectReview<Handle>(
  deps: ProjectReadDeps<Handle>,
  ctx: UseCaseContext,
  input: ProjectInput,
): Promise<Result<ProjectReview>> {
  return runProjectRead(ctx, input, (tenantId, projectId) =>
    deps.projectRead.loadReview(deps.handle, tenantId, projectId),
  );
}
