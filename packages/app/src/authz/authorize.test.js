import { describe, expect, it } from 'vitest';
import { authorize, PROJECT_REACH_ROLES, reachesProject, TENANT_ADMIN_ROLES } from './authorize';
/**
 * The declared-roles helper in isolation (story 1.5): role miss, admin ignore of `projectIds`,
 * PM hit/miss, empty `projectIds`, viewer refusal. The use-case runners and harnesses prove the
 * same through their families.
 */
function ctxOf(roles, projectIds = []) {
    return { tenantId: 'ten-a', userId: 'usr-a', roles, projectIds, locale: 'en' };
}
const NOT_FOUND = { ok: false, error: { code: 'not_found', messageKey: 'errors.not_found' } };
describe('authorize — role intersection', () => {
    it('answers ok when the caller holds one of the declared roles', () => {
        expect(authorize(ctxOf(['tenant_admin']), { roles: TENANT_ADMIN_ROLES })).toEqual({
            ok: true,
            value: undefined,
        });
        expect(authorize(ctxOf(['pm']), { roles: PROJECT_REACH_ROLES })).toEqual({
            ok: true,
            value: undefined,
        });
    });
    it('answers not_found when the caller holds none of the declared roles', () => {
        expect(authorize(ctxOf(['pm']), { roles: TENANT_ADMIN_ROLES })).toEqual(NOT_FOUND);
        expect(authorize(ctxOf(['client_viewer']), { roles: PROJECT_REACH_ROLES })).toEqual(NOT_FOUND);
        expect(authorize(ctxOf(['internal_viewer']), { roles: PROJECT_REACH_ROLES })).toEqual(NOT_FOUND);
        expect(authorize(ctxOf([]), { roles: TENANT_ADMIN_ROLES })).toEqual(NOT_FOUND);
    });
});
describe('authorize — Project reach', () => {
    it('lets a tenant_admin through regardless of projectIds (including empty or stale)', () => {
        const empty = ctxOf(['tenant_admin'], []);
        const stale = ctxOf(['tenant_admin'], ['prj-gone']);
        expect(authorize(empty, { roles: PROJECT_REACH_ROLES, projectId: 'prj-1' })).toEqual({
            ok: true,
            value: undefined,
        });
        expect(authorize(stale, { roles: PROJECT_REACH_ROLES, projectId: 'prj-1' })).toEqual({
            ok: true,
            value: undefined,
        });
        expect(reachesProject(empty, 'prj-1')).toBe(true);
    });
    it('lets a PM through when projectIds contains the Project', () => {
        const pm = ctxOf(['pm'], ['prj-1', 'prj-2']);
        expect(authorize(pm, { roles: PROJECT_REACH_ROLES, projectId: 'prj-1' })).toEqual({
            ok: true,
            value: undefined,
        });
    });
    it('answers not_found when a PM\'s projectIds does not contain the Project', () => {
        expect(authorize(ctxOf(['pm'], ['prj-other']), { roles: PROJECT_REACH_ROLES, projectId: 'prj-1' })).toEqual(NOT_FOUND);
    });
    it('answers not_found for a PM with empty projectIds — reaches no Project', () => {
        expect(authorize(ctxOf(['pm'], []), { roles: PROJECT_REACH_ROLES, projectId: 'prj-1' })).toEqual(NOT_FOUND);
        expect(reachesProject(ctxOf(['pm'], []), 'prj-1')).toBe(false);
    });
    it('refuses a viewer even when projectIds names the Project', () => {
        expect(authorize(ctxOf(['client_viewer'], ['prj-1']), {
            roles: PROJECT_REACH_ROLES,
            projectId: 'prj-1',
        })).toEqual(NOT_FOUND);
    });
    it('skips the Project check when no projectId is declared', () => {
        expect(authorize(ctxOf(['pm'], []), { roles: PROJECT_REACH_ROLES })).toEqual({
            ok: true,
            value: undefined,
        });
    });
});
