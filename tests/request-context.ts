import type { RequestContext } from '../packages/app/src/authz/request-context';

/**
 * The RequestContext the harnesses call use cases with (story 1.4 slice 1).
 *
 * The web resolves a context per request from the session and the membership bridge
 * (`resolveRequestContext`); a harness that drives use cases directly states one instead — test
 * wiring, like the rest of `tests/`. The user is the harness's own, distinct from every fixture
 * actor, so the audit rows a write lands (`user:<userId>`) can be told apart from the seed's.
 */
export const HARNESS_USER_ID = 'xtprobe-writer';

/** A signed-in PM of `tenantId`. Roles and Projects are carried, not yet read (story 1.5). */
export function requestContextFor(tenantId: string, userId: string = HARNESS_USER_ID): RequestContext {
  return { tenantId, userId, roles: ['pm'], projectIds: [], locale: 'en' };
}
