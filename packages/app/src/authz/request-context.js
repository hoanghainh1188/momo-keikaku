/**
 * WHAT EVERY USE CASE IS TOLD ABOUT THE CALLER (story 1.4 slice 1, AR-40) — the architecture's
 * `RequestContext { tenantId, userId, roles, projectIds, locale }`.
 *
 * Built per request by `resolveRequestContext` (`./resolve-request-context.ts`) from the signed-in
 * session and the tenant-membership bridge, validated on EVERY request, and handed to every use
 * case by the composition root. It replaced story 1.2's one-field `UseCaseContext` and the
 * composition root's constant Tenant and audit actor: an inbound adapter cannot name a Tenant or
 * an actor any more, only resolve them.
 *
 * `roles` and `projectIds` are read by the declared-roles helper (`./authorize.ts`, story 1.5):
 * every use case declares its allowed roles, and a project-scoped call also checks Project reach.
 * A `tenant_admin` always reaches every Project of the Tenant; a non-admin reaches only ids in
 * `projectIds` (empty ⇒ none). Membership writers still re-check the caller's role against the
 * locked bridge row inside their transaction, since a context resolved once per server action may
 * be stale. A seeded Tenant Admin's membership names no Projects (they reach every one); a PM's
 * names theirs.
 */
export const ROLES = ['tenant_admin', 'pm', 'client_viewer', 'internal_viewer'];
/** The UI languages (FR-44). Vietnamese UI is out of scope permanently. */
export const LOCALES = ['en', 'ja'];
/** True for a role this release knows. */
export function isRole(value) {
    return typeof value === 'string' && ROLES.includes(value);
}
/** The user's locale, or `en` for anything this release does not ship. */
export function localeOf(value) {
    return typeof value === 'string' && LOCALES.includes(value)
        ? value
        : 'en';
}
/**
 * The audit actor for a context — `user:<userId>`. The one place the actor is derived: every
 * audited write stamps it (`use-cases/audited-write.ts`), so no inbound adapter states one.
 */
export function auditActorOf(ctx) {
    return `user:${ctx.userId}`;
}
