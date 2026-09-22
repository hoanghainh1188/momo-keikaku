/**
 * THE IDENTITY PORT (story 1.4 slice 1, AD-1 carve-out 1): what `resolveRequestContext` needs
 * from the session store, and nothing more.
 *
 * DECLARED HERE, SATISFIED STRUCTURALLY. `packages/db/auth` implements it on Better Auth
 * (`identityOn(auth, db)`) and may not import `@momo/app`; the composition root's `satisfies` checks
 * the match. The request's headers are a type parameter, so this layer never names a web type.
 *
 * Sign-in and sign-out are NOT here: they are the composition root's auth bindings, called by the
 * web's own actions. Role, membership and revocation changes are not here either, and never will
 * be: they are audited use cases (slices 2 and later), not side effects of the auth adapter.
 */

/** The signed-in session, as far as the resolver is concerned. */
export interface SessionIdentity {
  /** The session token — what `setActiveTenant` and `endSession` name the session by. */
  readonly token: string;
  readonly userId: string;
  /** The Tenant the session was last resolved into, or `null` before the first resolution. */
  readonly activeTenantId: string | null;
  /** The user's locale as stored; the resolver narrows it. */
  readonly locale: string;
}

/**
 * A user row for display (story 1.7 / AD-23): the audit-log reader and the top-bar chip.
 * `name` is always present on `auth_user` (NOT NULL); callers may still prefer email when empty.
 */
export interface IdentityUser {
  readonly userId: string;
  readonly email: string;
  readonly locale: string;
  readonly name: string;
}

export interface IdentityPort<Headers> {
  /**
   * The session the headers carry, or `null` when there is none or it has expired. Read WITHOUT
   * refreshing it: the refresh (the sliding idle timeout) is the middleware's, on page and action
   * requests; this read must not also slide it from a render that cannot write cookies.
   */
  readonly sessionFrom: (headers: Headers) => Promise<SessionIdentity | null>;
  /** Records the Tenant the session acts in. Called by the resolver only. */
  readonly setActiveTenant: (token: string, tenantId: string) => Promise<void>;
  /** Deletes the session: its active Tenant did not validate against a membership. */
  readonly endSession: (token: string) => Promise<void>;
  /**
   * Looks up an `auth_user` by id for display (AD-23 first reader). `null` when no row —
   * the audit log then shows the raw `actor` string.
   */
  readonly lookupUser: (userId: string) => Promise<IdentityUser | null>;
}
