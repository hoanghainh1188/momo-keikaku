import type { RequestContext, Role } from '../packages/app/src/authz/request-context';

/**
 * The RequestContext the harnesses call use cases with (story 1.4 slice 1).
 *
 * The web resolves a context per request from the session and the membership bridge
 * (`resolveRequestContext`); a harness that drives use cases directly states one instead — test
 * wiring, like the rest of `tests/`. The user is the harness's own, distinct from every fixture
 * actor, so the audit rows a write lands (`user:<userId>`) can be told apart from the seed's.
 */
export const HARNESS_USER_ID = 'xtprobe-writer';

/**
 * A signed-in member of `tenantId` — a PM unless `roles` says otherwise. Roles and Projects are
 * carried and not yet read (story 1.5), except by story 1.4 slice 2's membership writes, which
 * require `tenant_admin`: their registry entries call with `['tenant_admin']`, because a PM context
 * would answer `not_found` at the role gate and make the foreign-Tenant assertion vacuous.
 */
export function requestContextFor(
  tenantId: string,
  userId: string = HARNESS_USER_ID,
  roles: readonly Role[] = ['pm'],
): RequestContext {
  return { tenantId, userId, roles, projectIds: [], locale: 'en' };
}

/** A signed-in Tenant Admin of `tenantId` — what the membership writes require. */
export function adminContextFor(tenantId: string, userId: string = HARNESS_USER_ID): RequestContext {
  return requestContextFor(tenantId, userId, ['tenant_admin']);
}
