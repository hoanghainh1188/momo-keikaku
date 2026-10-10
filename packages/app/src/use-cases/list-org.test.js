/**
 * Organisation list readers (story 2.17): Tenant Admin only; PM gets `not_found` before the
 * port. Pure — no database; the port is faked.
 */
import { describe, expect, it, vi } from 'vitest';
import { listDepartments, listPrograms, listProjects } from './list-org';
const ADMIN = {
    tenantId: 'ten-a',
    userId: 'usr-admin',
    roles: ['tenant_admin'],
    projectIds: [],
    locale: 'en',
};
const PM = {
    tenantId: 'ten-a',
    userId: 'usr-pm',
    roles: ['pm'],
    projectIds: ['prj-1'],
    locale: 'en',
};
const DEPARTMENTS = [
    { id: 'dep-1', name: 'Delivery' },
    { id: 'dep-2', name: 'Design' },
];
const PROGRAMS = [
    {
        id: 'prog-1',
        departmentId: 'dep-1',
        departmentName: 'Delivery',
        name: 'Phase 2',
    },
];
const PROJECTS = [
    {
        id: 'prj-1',
        name: 'EC Phase 2',
        departmentId: 'dep-1',
        departmentName: 'Delivery',
        programId: 'prog-1',
        programName: 'Phase 2',
    },
];
function deps() {
    return {
        handle: { marker: 'handle' },
        orgRead: {
            listDepartments: vi.fn(async () => DEPARTMENTS),
            listPrograms: vi.fn(async () => PROGRAMS),
            listProjects: vi.fn(async () => PROJECTS),
        },
    };
}
const NOT_FOUND = {
    ok: false,
    error: { code: 'not_found', messageKey: 'errors.not_found' },
};
describe('listDepartments', () => {
    it('refuses a PM with not_found before touching the port', async () => {
        const d = deps();
        expect(await listDepartments(d, PM)).toEqual(NOT_FOUND);
        expect(d.orgRead.listDepartments).not.toHaveBeenCalled();
    });
    it('lists Departments for a Tenant Admin', async () => {
        const d = deps();
        const result = await listDepartments(d, ADMIN);
        expect(result).toEqual({ ok: true, value: { rows: DEPARTMENTS } });
        expect(d.orgRead.listDepartments).toHaveBeenCalledWith(d.handle, 'ten-a');
    });
});
describe('listPrograms', () => {
    it('refuses a PM with not_found before touching the port', async () => {
        const d = deps();
        expect(await listPrograms(d, PM)).toEqual(NOT_FOUND);
        expect(d.orgRead.listPrograms).not.toHaveBeenCalled();
    });
    it('lists Programs with Department names for a Tenant Admin', async () => {
        const d = deps();
        const result = await listPrograms(d, ADMIN);
        expect(result).toEqual({ ok: true, value: { rows: PROGRAMS } });
        expect(d.orgRead.listPrograms).toHaveBeenCalledWith(d.handle, 'ten-a');
    });
});
describe('listProjects', () => {
    it('refuses a PM with not_found before touching the port', async () => {
        const d = deps();
        expect(await listProjects(d, PM)).toEqual(NOT_FOUND);
        expect(d.orgRead.listProjects).not.toHaveBeenCalled();
    });
    it('lists Projects with parent names for a Tenant Admin', async () => {
        const d = deps();
        const result = await listProjects(d, ADMIN);
        expect(result).toEqual({ ok: true, value: { rows: PROJECTS } });
        expect(d.orgRead.listProjects).toHaveBeenCalledWith(d.handle, 'ten-a');
    });
});
