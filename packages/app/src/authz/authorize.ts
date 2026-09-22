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

/** Roles that may call Organisation and membership writes. */
export const TENANT_ADMIN_ROLES = ['tenant_admin'] as const satisfies readonly Role[];

/** Roles that may call Project reads and Plan/Mapping writes — plus Project reach. */
export const PROJECT_REACH_ROLES = ['tenant_admin', 'pm'] as const satisfies readonly Role[];

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
  if (ctx.roles.includes('tenant_admin')) return true;
  return ctx.projectIds.includes(projectId);
}
