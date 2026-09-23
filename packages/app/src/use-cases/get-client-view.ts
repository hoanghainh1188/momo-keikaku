import { PROJECT_REACH, type RoleDeclaration } from '../authz/authorize';
import { clientProjection, DEFAULT_VISIBILITY, type ClientOutputs } from '@momo/domain';
import type { Result } from '../result';
import type { ProjectReadDeps } from '../ports/project-read';
import type { RequestContext } from '../authz/request-context';
import { runProjectRead, type ProjectInput } from './project-input';

/**
 * What the Client View preview renders: the client projection under the default visibility
 * policy, and the client's name for the report's subtitle.
 *
 * FR-34 / AD-12: `projection` is `ClientOutputs`, a type with no money, Rate, person, Tracker
 * Account or Ticket-content field, so the omission is the compiler's to check. The page used to
 * call `clientProjection` itself; it now receives the projection, and computes nothing.
 */
export interface ClientView {
  readonly clientName: string;
  readonly projection: ClientOutputs;
}

/**
 * The client projection of a Project's Reconciliation Review, with `DEFAULT_VISIBILITY`.
 *
 * Same contract as `getProjectReview`, whose load it shares: `not_found` for a Project that
 * does not exist or is another Tenant's, `invalid_input` for an empty or absent `projectId`,
 * and every other failure propagates.
 */
export async function getClientView<Handle>(
  deps: ProjectReadDeps<Handle>,
  ctx: RequestContext,
  input: ProjectInput,
): Promise<Result<ClientView>> {
  return runProjectRead(ctx, input, async (tenantId, projectId) => {
    const { bundle, review } = await deps.projectRead.loadReview(deps.handle, tenantId, projectId);
    return {
      clientName: bundle.meta.clientName,
      projection: clientProjection(review, bundle.project.name, DEFAULT_VISIBILITY),
    };
  });
}

/** Role declaration for this use case (colocated — see `role-declarations.ts`). */
export const GET_CLIENT_VIEW_ROLES = {
  getClientView: PROJECT_REACH,
} as const satisfies Readonly<Record<string, RoleDeclaration>>;
