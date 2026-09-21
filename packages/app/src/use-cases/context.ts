/**
 * What every use case is told about the caller: the Tenant, and nothing else.
 *
 * A placeholder in the SHAPE story 1.4 will fill. The architecture's `RequestContext` is
 * `{ tenantId, userId, roles, projectIds, locale }`, resolved per request by
 * `resolveRequestContext` from the session and the membership bridge — none of which exists
 * yet. Until it does, the one field this release can honestly supply is the Tenant, and it is
 * constructed in exactly one place (the composition root) instead of being named at seven
 * call sites. Adding a field here is story 1.4's decision, not a convenience.
 */
export interface UseCaseContext {
  readonly tenantId: string;
}
