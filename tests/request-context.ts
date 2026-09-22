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
 * A signed-in member of `tenantId` — a PM unless `roles` says otherwise. Story 1.5's declared-roles
 * helper reads `roles` and `projectIds`: membership and organisation writes need `tenant_admin`
 * (see `adminContextFor`); project reads and Plan/Mapping writes need the probe Project id on a
 * PM context (or an admin context), or the role gate answers `not_found` and a foreign-Tenant
 * assertion becomes vacuous.
 */
export function requestContextFor(
  tenantId: string,
  userId: string = HARNESS_USER_ID,
  roles: readonly Role[] = ['pm'],
  projectIds: readonly string[] = [],
): RequestContext {
  return { tenantId, userId, roles, projectIds, locale: 'en' };
}

/** A signed-in Tenant Admin of `tenantId` — what membership and organisation writes require. */
export function adminContextFor(tenantId: string, userId: string = HARNESS_USER_ID): RequestContext {
  return requestContextFor(tenantId, userId, ['tenant_admin']);
}

/**
 * A signed-in PM of `tenantId` that reaches `projectId` — what project reads and Plan/Mapping
 * writes need so the role gate passes and foreign-Tenant checks still hit RLS.
 */
export function pmContextFor(
  tenantId: string,
  projectId: string,
  userId: string = HARNESS_USER_ID,
): RequestContext {
  return requestContextFor(tenantId, userId, ['pm'], [projectId]);
}
