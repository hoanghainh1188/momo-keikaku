/**
 * Organisation Admin server actions (story 2.17) — FormData → use-case shaping at the action
 * boundary. Composition is mocked; helpers alone are not enough to guard clear-Program,
 * no-default contractType, or resetKey bump-only-on-success.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const revalidatePath = vi.hoisted(() => vi.fn());
const requestContext = vi.hoisted(() => vi.fn(async () => ({ tenantId: 't1', userId: 'u1', role: 'tenant_admin' })));
const createProject = vi.hoisted(() => vi.fn());
const reassignProjectProgram = vi.hoisted(() => vi.fn());
const reassignProjectDepartment = vi.hoisted(() => vi.fn());
const createDepartment = vi.hoisted(() => vi.fn());

vi.mock('next/cache', () => ({ revalidatePath }));
vi.mock('@/server/composition', () => ({
  requestContext,
  createDepartment,
  createProgram: vi.fn(),
  createProject,
  renameDepartment: vi.fn(),
  renameProgram: vi.fn(),
  renameProject: vi.fn(),
  reassignProjectProgram,
  reassignProjectDepartment,
}));
vi.mock('@/server/error-message', () => ({
  messageFromKey: (key: string) => key,
}));

const {
  createDepartmentAction,
  createProjectAction,
  reassignProjectProgramAction,
  INITIAL_ORG_ACTION,
} = await import('./actions');

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [name, value] of Object.entries(fields)) data.set(name, value);
  return data;
}

beforeEach(() => {
  revalidatePath.mockReset();
  createProject.mockReset();
  reassignProjectProgram.mockReset();
  reassignProjectDepartment.mockReset();
  createDepartment.mockReset();
});

describe('createProjectAction', () => {
  it('refuses empty contractType without inventing 請負 and without calling createProject', async () => {
    const next = await createProjectAction(
      INITIAL_ORG_ACTION,
      form({
        name: 'EC',
        departmentId: 'd1',
        programId: '',
        clientName: 'Client',
        contractType: '',
      }),
    );
    expect(next).toEqual({ error: 'errors.invalid_input', resetKey: 0 });
    expect(createProject).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('passes empty programId as null and bumps resetKey on success', async () => {
    createProject.mockResolvedValueOnce({ ok: true, value: undefined });
    const next = await createProjectAction(
      { error: null, resetKey: 3 },
      form({
        name: 'EC',
        departmentId: 'd1',
        programId: '',
        clientName: 'Client',
        contractType: '請負',
      }),
    );
    expect(createProject).toHaveBeenCalledWith(
      {
        name: 'EC',
        departmentId: 'd1',
        programId: null,
        clientName: 'Client',
        contractType: '請負',
      },
      expect.anything(),
    );
    expect(next).toEqual({ error: null, resetKey: 4 });
    expect(revalidatePath).toHaveBeenCalledWith('/admin/departments');
    expect(revalidatePath).toHaveBeenCalledWith('/admin/programs');
    expect(revalidatePath).toHaveBeenCalledWith('/admin/projects');
  });

  it('keeps resetKey unchanged on refuse', async () => {
    createProject.mockResolvedValueOnce({
      ok: false,
      error: { messageKey: 'errors.invalid_input' },
    });
    const next = await createProjectAction(
      { error: null, resetKey: 2 },
      form({
        name: 'EC',
        departmentId: 'd1',
        programId: 'prog-1',
        clientName: 'Client',
        contractType: '請負',
      }),
    );
    expect(next).toEqual({ error: 'errors.invalid_input', resetKey: 2 });
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

describe('reassignProjectProgramAction', () => {
  it('maps empty programId to null (clear Program)', async () => {
    reassignProjectProgram.mockResolvedValueOnce({ ok: true, value: undefined });
    await reassignProjectProgramAction(
      INITIAL_ORG_ACTION,
      form({ projectId: 'proj-1', programId: '' }),
    );
    expect(reassignProjectProgram).toHaveBeenCalledWith(
      { projectId: 'proj-1', programId: null },
      expect.anything(),
    );
  });
});

describe('createDepartmentAction', () => {
  it('revalidates all three org admin paths on success', async () => {
    createDepartment.mockResolvedValueOnce({ ok: true, value: undefined });
    await createDepartmentAction(INITIAL_ORG_ACTION, form({ name: 'Delivery' }));
    expect(revalidatePath.mock.calls.map((c) => c[0])).toEqual([
      '/admin/departments',
      '/admin/programs',
      '/admin/projects',
    ]);
  });
});
