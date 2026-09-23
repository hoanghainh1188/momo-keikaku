/**
 * THE DECLARED-ROLES MECHANISM (story 1.5, AD-12 / AD-23) — one place every use case runs before
 * its work: the caller's roles must intersect the use case's declared set, and when the call
 * names a Project the caller must reach it.
 *
 * A `tenant_admin` always reaches every Project of the Tenant (its `projectIds` are never a
 * limit). Anyone else reaches only ids in `ctx.projectIds` (empty ⇒ none). Refusal is always
 * `not_found`, never `forbidden`, so existence outside the caller's set is not disclosed.
 *
 * The UI never calls this: pages and actions only call use-case bindings. Membership writers
 * still re-check the caller's locked bridge row inside their transaction (AD-23) — a context
 * resolved once per server action can be stale.
 */
import { fail, ok, type Result } from '../result';
import type { RequestContext, Role } from './request-context';

/** What a use case declares for the gate — allowed roles, and optionally a Project to reach. */
export interface RoleGate {
  /** At least one of these must appear in `ctx.roles`. */
  readonly roles: readonly Role[];
  /**
   * When set, the caller must reach this Project. A `tenant_admin` always does; a non-admin
   * reaches only ids in `ctx.projectIds`.
   */
  readonly projectId?: string;
}

/** The Tenant Admin role name — one spelling for role sets and the membership lock re-check. */
export const TENANT_ADMIN = 'tenant_admin' as const satisfies Role;

/** Roles that may call Organisation and membership writes. */
export const TENANT_ADMIN_ROLES = [TENANT_ADMIN] as const satisfies readonly Role[];

/** Roles that may call Project reads and Plan/Mapping writes — plus Project reach. */
export const PROJECT_REACH_ROLES = [TENANT_ADMIN, 'pm'] as const satisfies readonly Role[];

/** Roles that may create a Resource (no Project check) — the third declaration shape. */
export const STAFF_RESOURCE_ROLES = [TENANT_ADMIN, 'pm'] as const satisfies readonly Role[];

/**
 * Authorises a call against `RequestContext`. Returns `not_found` when the caller is outside
 * the allowed set or outside Project reach; otherwise `ok`.
 */
export function authorize(ctx: RequestContext, gate: RoleGate): Result<void> {
  if (!gate.roles.some((role) => ctx.roles.includes(role))) return fail('not_found');
  if (gate.projectId !== undefined && !reachesProject(ctx, gate.projectId)) {
    return fail('not_found');
  }
  return ok(undefined);
}

/**
 * True when the caller reaches `projectId`. A `tenant_admin` always reaches; a non-admin only
 * when the id is in `ctx.projectIds`.
 */
export function reachesProject(ctx: RequestContext, projectId: string): boolean {
  if (ctx.roles.includes(TENANT_ADMIN)) return true;
  return ctx.projectIds.includes(projectId);
}

/**
 * WHAT ONE USE CASE DECLARES FOR THE ROLE GATE.
 *
 * Lives here, beside the role sets, rather than in `use-cases/role-declarations.ts`, so that each
 * use-case module can declare its own roles without importing the file that aggregates them —
 * which would be a cycle. Epic 1 retrospective, F12.
 */
export interface RoleDeclaration {
  readonly roles: readonly Role[];
  /** True when the call names a Project — the helper also checks Project reach. */
  readonly projectScoped: boolean;
}

/** Tenant Admin only, no Project: Organisation, membership, Rate, audit-log and Tenant settings. */
export const ADMIN_ONLY = {
  roles: TENANT_ADMIN_ROLES,
  projectScoped: false,
} as const satisfies RoleDeclaration;

/** Project reads and Plan/Mapping writes — `tenant_admin` | `pm` plus Project reach. */
export const PROJECT_REACH = {
  roles: PROJECT_REACH_ROLES,
  projectScoped: true,
} as const satisfies RoleDeclaration;

/** Tenant Admin or PM, no Project — Resource create only (story 1.6). */
export const STAFF_RESOURCE = {
  roles: STAFF_RESOURCE_ROLES,
  projectScoped: false,
} as const satisfies RoleDeclaration;
