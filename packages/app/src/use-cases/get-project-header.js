import { PROJECT_REACH } from '../authz/authorize';
import { runProjectRead } from './project-input';
/**
 * The Project bundle, for the frame every project page renders inside.
 *
 * The layout reads four fields of it — the Project and client names, the pinned snapshot's
 * time and its age — but the use case returns the whole bundle: narrowing it is a rewrite of
 * the views, not a rewiring, and this slice is the rewiring.
 *
 * `not_found` when the Project does not exist OR belongs to another Tenant; the two are one
 * event under row-level security, and answering them alike is what keeps existence from
 * being disclosed. `invalid_input` for an empty or absent `projectId` — there is no default
 * Project: the repository's `prj-ec2` default is not carried forward.
 */
export async function getProjectHeader(deps, ctx, input) {
    return runProjectRead(ctx, input, (tenantId, projectId) => deps.projectRead.loadProjectBundle(deps.handle, tenantId, projectId));
}
/** Role declaration for this use case (colocated — see `role-declarations.ts`). */
export const GET_PROJECT_HEADER_ROLES = {
    getProjectHeader: PROJECT_REACH,
};
