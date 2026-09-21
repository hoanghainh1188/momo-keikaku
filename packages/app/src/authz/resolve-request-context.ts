/**
 * `resolveRequestContext` — THE ONE PLACE A REQUEST BECOMES A CONTEXT (story 1.4 slice 1, AR-40).
 *
 * Runs on every request (the web resolves it at most once per render, through React `cache()`,
 * and a server action resolves it once and hands the result to every binding it calls). It reads
 * the session through `IdentityPort` and the user's memberships through the bridge's one reader,
 * and answers one of three outcomes:
 *
 *   * `signed_out` — no session, an expired one, or a session whose active Tenant has no
 *     matching membership. That last one is DELETED on the spot: an active Tenant that does not
 *     validate is a tampered or stale session, and it is not given a second request.
 *   * `no_access` — signed in, but there is no Tenant to act in: zero memberships, or several
 *     and no active Tenant (there is no tenant switcher yet, so none is chosen for the user).
 *     Several is logged with its reason; the web shows a plain "no access" page for both.
 *   * `signed_in` — the context, built from the matching membership.
 *
 * With no active Tenant and exactly one membership, the resolver chooses it and PERSISTS it
 * through `IdentityPort.setActiveTenant`, so every later request validates an explicit choice.
 *
 * Session times are not compared here, against the `Clock` or anything else: Better Auth's own
 * expiry check (inside `sessionFrom`) is the authority on idle expiry, and the resolver only
 * decides what a live session may act as.
 */
import type { IdentityPort, SessionIdentity } from '../ports/identity';
import type { MembershipReader, MembershipRecord } from '../ports/membership';
import { isRole, localeOf, type RequestContext } from './request-context';

export type NoAccessReason = 'no_membership' | 'several_memberships';

export type RequestContextResolution =
  | { readonly status: 'signed_in'; readonly context: RequestContext }
  | { readonly status: 'no_access'; readonly userId: string; readonly reason: NoAccessReason }
  | { readonly status: 'signed_out' };

/** Why a signed-in user was shown "no access", for the log. Never shown to the user. */
export interface NoAccessEvent {
  readonly userId: string;
  readonly reason: NoAccessReason;
  readonly memberships: number;
}

/** What the resolver is given, all chosen by the composition root. */
export interface ResolveRequestContextDeps<Headers, Handle> {
  readonly identity: IdentityPort<Headers>;
  readonly handle: Handle;
  readonly memberships: MembershipReader<Handle>;
  /** Told when a user with several memberships (and no active Tenant) is refused. */
  readonly onNoAccess?: (event: NoAccessEvent) => void;
}

const SIGNED_OUT: RequestContextResolution = { status: 'signed_out' };

/** The memberships whose role this release knows; a row with any other role grants nothing. */
function usable(memberships: readonly MembershipRecord[]): readonly MembershipRecord[] {
  return memberships.filter((membership) => isRole(membership.role));
}

function contextOf(session: SessionIdentity, membership: MembershipRecord): RequestContext {
  return {
    tenantId: membership.tenantId,
    userId: session.userId,
    roles: isRole(membership.role) ? [membership.role] : [],
    projectIds: [...membership.projectIds],
    locale: localeOf(session.locale),
  };
}

export async function resolveRequestContext<Headers, Handle>(
  deps: ResolveRequestContextDeps<Headers, Handle>,
  headers: Headers,
): Promise<RequestContextResolution> {
  const session = await deps.identity.sessionFrom(headers);
  if (session === null) return SIGNED_OUT;

  const memberships = usable(await deps.memberships.membershipsOf(deps.handle, session.userId));

  if (session.activeTenantId !== null) {
    const membership = memberships.find((m) => m.tenantId === session.activeTenantId);
    if (membership === undefined) {
      // Tampered, or the membership is gone: the session does not get another request.
      await deps.identity.endSession(session.token);
      return SIGNED_OUT;
    }
    return { status: 'signed_in', context: contextOf(session, membership) };
  }

  if (memberships.length === 1) {
    const only = memberships[0]!;
    await deps.identity.setActiveTenant(session.token, only.tenantId);
    return { status: 'signed_in', context: contextOf(session, only) };
  }

  if (memberships.length === 0) {
    return { status: 'no_access', userId: session.userId, reason: 'no_membership' };
  }

  deps.onNoAccess?.({
    userId: session.userId,
    reason: 'several_memberships',
    memberships: memberships.length,
  });
  return { status: 'no_access', userId: session.userId, reason: 'several_memberships' };
}
