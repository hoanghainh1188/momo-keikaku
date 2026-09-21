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
 * `roles` and `projectIds` are carried and, with one exception, not yet read — the role checks are
 * story 1.5's. The exception is story 1.4 slice 2's membership writes, which require `tenant_admin`
 * as a local check (`use-cases/membership-writes.ts`) and re-check it against the bridge inside
 * their transaction, since a context resolved once per server action may be stale. A seeded Tenant
 * Admin's membership names no Projects (they reach every one); a PM's names theirs.
 */
export const ROLES = ['tenant_admin', 'pm', 'client_viewer', 'internal_viewer'] as const;
export type Role = (typeof ROLES)[number];

/** The UI languages (FR-44). Vietnamese UI is out of scope permanently. */
export const LOCALES = ['en', 'ja'] as const;
export type Locale = (typeof LOCALES)[number];

export interface RequestContext {
  /** The Tenant the request acts in: the session's active Tenant, matched against a membership. */
  readonly tenantId: string;
  /** The signed-in user (Better Auth's user id, a UUIDv7). */
  readonly userId: string;
  /** The user's roles in `tenantId`, from the membership. */
  readonly roles: readonly Role[];
  /** The Projects the membership names. */
  readonly projectIds: readonly string[];
  readonly locale: Locale;
}

/** True for a role this release knows. */
export function isRole(value: unknown): value is Role {
  return typeof value === 'string' && (ROLES as readonly string[]).includes(value);
}

/** The user's locale, or `en` for anything this release does not ship. */
export function localeOf(value: unknown): Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value)
    ? (value as Locale)
    : 'en';
}

/**
 * The audit actor for a context — `user:<userId>`. The one place the actor is derived: every
 * audited write stamps it (`use-cases/audited-write.ts`), so no inbound adapter states one.
 */
export function auditActorOf(ctx: Pick<RequestContext, 'userId'>): string {
  return `user:${ctx.userId}`;
}
