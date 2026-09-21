/**
 * THE IDENTITY PORT, ON BETTER AUTH (story 1.4 slice 1) — `packages/app`'s `IdentityPort`,
 * satisfied structurally (this package may not import `@momo/app`; the composition root's
 * `satisfies` checks the match).
 *
 * Three members and no more. Sign-in and sign-out are the composition root's auth bindings; role,
 * membership and revocation changes are audited use cases, never this adapter's.
 */
import type { Auth } from './auth';

/** The session as `resolveRequestContext` sees it. Mirrors `@momo/app`'s `SessionIdentity`. */
export interface SessionIdentity {
  readonly token: string;
  readonly userId: string;
  readonly activeTenantId: string | null;
  readonly locale: string;
}

export interface BetterAuthIdentity {
  readonly sessionFrom: (headers: Headers) => Promise<SessionIdentity | null>;
  readonly setActiveTenant: (token: string, tenantId: string) => Promise<void>;
  readonly endSession: (token: string) => Promise<void>;
}

/** A nullable string field Better Auth hands back as `unknown`-ish; anything else is `null`. */
function textOrNull(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null;
}

export function identityOn(auth: Auth): BetterAuthIdentity {
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
  };
}
