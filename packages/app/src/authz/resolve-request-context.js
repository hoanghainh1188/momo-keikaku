import { isRole, localeOf } from './request-context';
const SIGNED_OUT = { status: 'signed_out' };
/** The memberships whose role this release knows; a row with any other role grants nothing. */
function usable(memberships) {
    return memberships.filter((membership) => isRole(membership.role));
}
function contextOf(session, membership) {
    return {
        tenantId: membership.tenantId,
        userId: session.userId,
        roles: isRole(membership.role) ? [membership.role] : [],
        projectIds: [...membership.projectIds],
        locale: localeOf(session.locale),
    };
}
export async function resolveRequestContext(deps, headers) {
    const session = await deps.identity.sessionFrom(headers);
    if (session === null)
        return SIGNED_OUT;
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
        const only = memberships[0];
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
