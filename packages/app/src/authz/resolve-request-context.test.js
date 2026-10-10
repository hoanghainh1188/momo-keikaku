import { describe, expect, it } from 'vitest';
import { auditActorOf } from './request-context';
import { resolveRequestContext } from './resolve-request-context';
/**
 * `resolveRequestContext` against a fake session store and a fake membership reader — no
 * database, no Better Auth. The Postgres half (the real bridge, the real session table, a real
 * sign-in) is `tests/identity.test.ts`.
 *
 * The rule this file exists for: an active Tenant is trusted ONLY after it has been matched
 * against a membership, on every request, and a session whose Tenant does not match is deleted.
 * Skip the match and the tampered-session case below fails.
 */
const HANDLE = { marker: 'bridge-handle' };
const HEADERS = { marker: 'request-headers' };
function fake({ session, memberships }) {
    const activeTenantSet = [];
    const ended = [];
    const reads = [];
    const logged = [];
    const deps = {
        handle: HANDLE,
        identity: {
            sessionFrom: async (headers) => {
                expect(headers).toBe(HEADERS);
                return session;
            },
            setActiveTenant: async (token, tenantId) => {
                activeTenantSet.push({ token, tenantId });
            },
            endSession: async (token) => {
                ended.push(token);
            },
            lookupUser: async () => null,
        },
        memberships: {
            membershipsOf: async (handle, userId) => {
                reads.push({ handle, userId });
                return memberships;
            },
        },
        onNoAccess: (event) => {
            logged.push(event);
        },
    };
    return { deps, activeTenantSet, ended, reads, logged };
}
const USER = '019b76da-a800-7000-8000-051111111111';
function sessionIn(activeTenantId, locale = 'en') {
    return { token: 'tok-1', userId: USER, activeTenantId, locale };
}
const PM_IN_A = { tenantId: 'ten-a', role: 'pm', projectIds: ['prj-1'] };
const ADMIN_IN_B = { tenantId: 'ten-b', role: 'tenant_admin', projectIds: [] };
describe('resolveRequestContext', () => {
    it('is signed out with no session, and reads no membership', async () => {
        const f = fake({ session: null, memberships: [PM_IN_A] });
        expect(await resolveRequestContext(f.deps, HEADERS)).toEqual({ status: 'signed_out' });
        expect(f.reads).toEqual([]);
    });
    it('builds the context from the membership that matches the active Tenant', async () => {
        const f = fake({ session: sessionIn('ten-b', 'ja'), memberships: [PM_IN_A, ADMIN_IN_B] });
        expect(await resolveRequestContext(f.deps, HEADERS)).toEqual({
            status: 'signed_in',
            context: { tenantId: 'ten-b', userId: USER, roles: ['tenant_admin'], projectIds: [], locale: 'ja' },
        });
        expect(f.reads).toEqual([{ handle: HANDLE, userId: USER }]);
        expect(f.activeTenantSet).toEqual([]);
        expect(f.ended).toEqual([]);
    });
    it('signs out, and DELETES the session, when the active Tenant has no matching membership', async () => {
        // The tampered case: `session.active_tenant_id` edited to a Tenant the user does not belong
        // to. Nothing under /p/ may render, and the session gets no second request.
        const f = fake({ session: sessionIn('ten-foreign'), memberships: [PM_IN_A] });
        expect(await resolveRequestContext(f.deps, HEADERS)).toEqual({ status: 'signed_out' });
        expect(f.ended).toEqual(['tok-1']);
        expect(f.activeTenantSet).toEqual([]);
    });
    it('signs out when the active Tenant\'s membership carries a role this release does not know', async () => {
        const f = fake({
            session: sessionIn('ten-a'),
            memberships: [{ tenantId: 'ten-a', role: 'superuser', projectIds: [] }],
        });
        expect(await resolveRequestContext(f.deps, HEADERS)).toEqual({ status: 'signed_out' });
        expect(f.ended).toEqual(['tok-1']);
    });
    it('chooses the single membership when no Tenant is active, and persists the choice', async () => {
        const f = fake({ session: sessionIn(null), memberships: [PM_IN_A] });
        const resolved = await resolveRequestContext(f.deps, HEADERS);
        expect(resolved).toEqual({
            status: 'signed_in',
            context: { tenantId: 'ten-a', userId: USER, roles: ['pm'], projectIds: ['prj-1'], locale: 'en' },
        });
        expect(f.activeTenantSet).toEqual([{ token: 'tok-1', tenantId: 'ten-a' }]);
        expect(f.ended).toEqual([]);
    });
    it('answers no_access for zero memberships, choosing and logging nothing', async () => {
        const f = fake({ session: sessionIn(null), memberships: [] });
        expect(await resolveRequestContext(f.deps, HEADERS)).toEqual({
            status: 'no_access',
            userId: USER,
            reason: 'no_membership',
        });
        expect(f.activeTenantSet).toEqual([]);
        expect(f.ended).toEqual([]);
        expect(f.logged).toEqual([]);
    });
    it('answers no_access for several memberships and no active Tenant, logs why, and chooses none', async () => {
        const f = fake({ session: sessionIn(null), memberships: [PM_IN_A, ADMIN_IN_B] });
        expect(await resolveRequestContext(f.deps, HEADERS)).toEqual({
            status: 'no_access',
            userId: USER,
            reason: 'several_memberships',
        });
        expect(f.activeTenantSet).toEqual([]);
        expect(f.logged).toEqual([{ userId: USER, reason: 'several_memberships', memberships: 2 }]);
    });
    it('narrows an unknown locale to en', async () => {
        const f = fake({ session: sessionIn('ten-a', 'vi'), memberships: [PM_IN_A] });
        const resolved = await resolveRequestContext(f.deps, HEADERS);
        expect(resolved.status === 'signed_in' && resolved.context.locale).toBe('en');
    });
    it('copies the membership\'s Projects rather than sharing the array', async () => {
        const projectIds = ['prj-1'];
        const f = fake({ session: sessionIn('ten-a'), memberships: [{ ...PM_IN_A, projectIds }] });
        const resolved = await resolveRequestContext(f.deps, HEADERS);
        expect(resolved.status === 'signed_in' && resolved.context.projectIds).toEqual(['prj-1']);
        expect(resolved.status === 'signed_in' && resolved.context.projectIds).not.toBe(projectIds);
    });
});
describe('auditActorOf', () => {
    it('is user:<userId>, the one actor form every audited write stamps', () => {
        expect(auditActorOf({ userId: USER })).toBe(`user:${USER}`);
    });
});
