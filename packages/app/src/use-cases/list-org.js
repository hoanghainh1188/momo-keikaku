/**
 * THE ORGANISATION LIST READERS (story 2.17): Departments, Programs and Projects for the
 * Tenant Admin hierarchy screens.
 *
 * Tenant Admin only; refusal is `not_found` (FR-2 / AD-12). Runs inside `withTenant` through the
 * port. No filters — each page lists the whole Tenant's rows with the parent names an Admin
 * needs to create, rename or reassign.
 */
import { ADMIN_ONLY, authorize, TENANT_ADMIN_ROLES, } from '../authz/authorize';
import { ok } from '../result';
/** Lists the caller's Tenant's Departments. Role refusal is before any port call. */
export async function listDepartments(deps, ctx) {
    const gate = authorize(ctx, { roles: TENANT_ADMIN_ROLES });
    if (!gate.ok)
        return gate;
    const rows = await deps.orgRead.listDepartments(deps.handle, ctx.tenantId);
    return ok({ rows });
}
/** Lists the caller's Tenant's Programs with owning Department names. */
export async function listPrograms(deps, ctx) {
    const gate = authorize(ctx, { roles: TENANT_ADMIN_ROLES });
    if (!gate.ok)
        return gate;
    const rows = await deps.orgRead.listPrograms(deps.handle, ctx.tenantId);
    return ok({ rows });
}
/** Lists the caller's Tenant's Projects with Department and optional Program names. */
export async function listProjects(deps, ctx) {
    const gate = authorize(ctx, { roles: TENANT_ADMIN_ROLES });
    if (!gate.ok)
        return gate;
    const rows = await deps.orgRead.listProjects(deps.handle, ctx.tenantId);
    return ok({ rows });
}
/** Role declarations for the three list readers (colocated — see `role-declarations.ts`). */
export const ORG_LIST_READ_ROLES = {
    listDepartments: ADMIN_ONLY,
    listPrograms: ADMIN_ONLY,
    listProjects: ADMIN_ONLY,
};
