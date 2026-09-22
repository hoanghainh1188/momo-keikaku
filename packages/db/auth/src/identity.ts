/**
 * THE IDENTITY PORT, ON BETTER AUTH (story 1.4 slice 1) — `packages/app`'s `IdentityPort`,
 * satisfied structurally (this package may not import `@momo/app`; the composition root's
 * `satisfies` checks the match).
 *
 * Session members plus `lookupUser` (story 1.7 / AD-23): the audit-log reader and the top-bar
 * chip resolve email/name from `auth_user`. Sign-in and sign-out stay the composition root's
 * auth bindings; role/membership writes stay audited use cases.
 */
import { eq } from 'drizzle-orm';
import { authUser, type Db } from '@momo/db';
import type { Auth } from './auth';

/** The session as `resolveRequestContext` sees it. Mirrors `@momo/app`'s `SessionIdentity`. */
export interface SessionIdentity {
  readonly token: string;
  readonly userId: string;
  readonly activeTenantId: string | null;
  readonly locale: string;
}

/** Display fields for an `auth_user` row. Mirrors `@momo/app`'s `IdentityUser`. */
export interface IdentityUser {
  readonly userId: string;
  readonly email: string;
  readonly locale: string;
  readonly name: string;
}

export interface BetterAuthIdentity {
  readonly sessionFrom: (headers: Headers) => Promise<SessionIdentity | null>;
  readonly setActiveTenant: (token: string, tenantId: string) => Promise<void>;
  readonly endSession: (token: string) => Promise<void>;
  readonly lookupUser: (userId: string) => Promise<IdentityUser | null>;
}

/** A nullable string field Better Auth hands back as `unknown`-ish; anything else is `null`. */
function textOrNull(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null;
}

/**
 * Looks up `auth_user` by id on a short transaction (global table — no `withTenant`). The
 * bare-handle lint forbids `db.select`; the transaction matches `membershipsOf`.
 */
export async function lookupUserOn(db: Db, userId: string): Promise<IdentityUser | null> {
  const rows = await db.transaction((tx) =>
    tx
      .select({
        id: authUser.id,
        email: authUser.email,
        name: authUser.name,
        locale: authUser.locale,
      })
      .from(authUser)
      .where(eq(authUser.id, userId))
      .limit(1),
  );
  const row = rows[0];
  if (row === undefined) return null;
  return {
    userId: row.id,
    email: row.email,
    locale: row.locale,
    name: row.name,
  };
}

export function identityOn(auth: Auth, db: Db): BetterAuthIdentity {
  return {
    sessionFrom: async (headers) => {
      // `disableRefresh`: a render reads the session and never slides it. The refresh is the
      // middleware's, on requests that can carry a Set-Cookie back (see `apps/web`'s
      // `middleware.ts`). Better Auth still refuses — and deletes — an expired session here.
      const found = await auth.api.getSession({ headers, query: { disableRefresh: true } });
      if (found === null) return null;
      return {
        token: found.session.token,
        userId: found.user.id,
        activeTenantId: textOrNull(found.session.activeTenantId),
        locale: textOrNull(found.user.locale) ?? 'en',
      };
    },
    setActiveTenant: async (token, tenantId) => {
      // Through the INTERNAL adapter: `auth.api.updateSession` refuses an `input: false` field
      // even on a server call, which is the point of `input: false` for every other caller.
      const context = await auth.$context;
      const updated = await context.internalAdapter.updateSession(token, { activeTenantId: tenantId });
      if (!updated) {
        throw new Error('setActiveTenant: the session vanished while its Tenant was being recorded.');
      }
    },
    endSession: async (token) => {
      const context = await auth.$context;
      await context.internalAdapter.deleteSession(token);
    },
    lookupUser: (userId) => lookupUserOn(db, userId),
  };
}
