/**
 * THE ORGANISATION LIST READERS (story 2.17): Departments, Programs and Projects for the
 * Tenant Admin hierarchy screens.
 *
 * Tenant Admin only; refusal is `not_found` (FR-2 / AD-12). Runs inside `withTenant` through the
 * port. No filters — each page lists the whole Tenant's rows with the parent names an Admin
 * needs to create, rename or reassign.
 */
import {
  ADMIN_ONLY,
  authorize,
  TENANT_ADMIN_ROLES,
  type RoleDeclaration,
} from '../authz/authorize';
import type { RequestContext } from '../authz/request-context';
import type {
  DepartmentListRow,
  OrgReadDeps,
  ProgramListRow,
  ProjectListRow,
} from '../ports/org-read';
import { ok, type Result } from '../result';

export interface DepartmentListPage {
  readonly rows: readonly DepartmentListRow[];
}

export interface ProgramListPage {
  readonly rows: readonly ProgramListRow[];
}

export interface ProjectListPage {
  readonly rows: readonly ProjectListRow[];
}

/** Lists the caller's Tenant's Departments. Role refusal is before any port call. */
export async function listDepartments<Handle>(
  deps: OrgReadDeps<Handle>,
  ctx: RequestContext,
): Promise<Result<DepartmentListPage>> {
  const gate = authorize(ctx, { roles: TENANT_ADMIN_ROLES });
  if (!gate.ok) return gate;
  const rows = await deps.orgRead.listDepartments(deps.handle, ctx.tenantId);
  return ok({ rows });
}

/** Lists the caller's Tenant's Programs with owning Department names. */
export async function listPrograms<Handle>(
  deps: OrgReadDeps<Handle>,
  ctx: RequestContext,
): Promise<Result<ProgramListPage>> {
  const gate = authorize(ctx, { roles: TENANT_ADMIN_ROLES });
  if (!gate.ok) return gate;
  const rows = await deps.orgRead.listPrograms(deps.handle, ctx.tenantId);
  return ok({ rows });
}

/** Lists the caller's Tenant's Projects with Department and optional Program names. */
export async function listProjects<Handle>(
  deps: OrgReadDeps<Handle>,
  ctx: RequestContext,
): Promise<Result<ProjectListPage>> {
  const gate = authorize(ctx, { roles: TENANT_ADMIN_ROLES });
  if (!gate.ok) return gate;
  const rows = await deps.orgRead.listProjects(deps.handle, ctx.tenantId);
  return ok({ rows });
}

/** Role declarations for the three list readers (colocated — see `role-declarations.ts`). */
export const ORG_LIST_READ_ROLES = {
  listDepartments: ADMIN_ONLY,
  listPrograms: ADMIN_ONLY,
  listProjects: ADMIN_ONLY,
} as const satisfies Readonly<Record<string, RoleDeclaration>>;
