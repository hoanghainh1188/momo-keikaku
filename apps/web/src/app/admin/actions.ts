'use server';

/**
 * Organisation Admin mutations (story 2.17) — thin wrappers over the eight existing org write
 * use cases. No new write logic. Refuse paths return an inline message; success revalidates.
 */
import { revalidatePath } from 'next/cache';
import {
  createDepartment,
  createProgram,
  createProject,
  reassignProjectDepartment,
  reassignProjectProgram,
  renameDepartment,
  renameProgram,
  renameProject,
  requestContext,
} from '@/server/composition';
import { messageFromKey } from '@/server/error-message';

export type OrgActionState = {
  readonly error: string | null;
};

const OK: OrgActionState = { error: null };

function refuse(result: {
  readonly ok: false;
  readonly error: { readonly messageKey: 'errors.not_found' | 'errors.invalid_input' };
}): OrgActionState {
  return { error: messageFromKey(result.error.messageKey) };
}

function field(formData: FormData, name: string): string {
  return String(formData.get(name) ?? '').trim();
}

/** Empty string → null (clear Program). */
function optionalId(formData: FormData, name: string): string | null {
  const value = field(formData, name);
  return value === '' ? null : value;
}

export async function createDepartmentAction(
  _prev: OrgActionState,
  formData: FormData,
): Promise<OrgActionState> {
  const ctx = await requestContext();
  const result = await createDepartment({ name: field(formData, 'name') }, ctx);
  if (!result.ok) return refuse(result);
  revalidatePath('/admin/departments');
  return OK;
}

export async function renameDepartmentAction(
  _prev: OrgActionState,
  formData: FormData,
): Promise<OrgActionState> {
  const ctx = await requestContext();
  const result = await renameDepartment(
    { departmentId: field(formData, 'departmentId'), name: field(formData, 'name') },
    ctx,
  );
  if (!result.ok) return refuse(result);
  revalidatePath('/admin/departments');
  return OK;
}

export async function createProgramAction(
  _prev: OrgActionState,
  formData: FormData,
): Promise<OrgActionState> {
  const ctx = await requestContext();
  const result = await createProgram(
    { departmentId: field(formData, 'departmentId'), name: field(formData, 'name') },
    ctx,
  );
  if (!result.ok) return refuse(result);
  revalidatePath('/admin/programs');
  return OK;
}

export async function renameProgramAction(
  _prev: OrgActionState,
  formData: FormData,
): Promise<OrgActionState> {
  const ctx = await requestContext();
  const result = await renameProgram(
    { programId: field(formData, 'programId'), name: field(formData, 'name') },
    ctx,
  );
  if (!result.ok) return refuse(result);
  revalidatePath('/admin/programs');
  return OK;
}

export async function createProjectAction(
  _prev: OrgActionState,
  formData: FormData,
): Promise<OrgActionState> {
  const ctx = await requestContext();
  const contractRaw = field(formData, 'contractType');
  const contractType = contractRaw === '準委任' ? '準委任' : '請負';
  const result = await createProject(
    {
      name: field(formData, 'name'),
      departmentId: field(formData, 'departmentId'),
      programId: optionalId(formData, 'programId'),
      clientName: field(formData, 'clientName'),
      contractType,
    },
    ctx,
  );
  if (!result.ok) return refuse(result);
  revalidatePath('/admin/projects');
  return OK;
}

export async function renameProjectAction(
  _prev: OrgActionState,
  formData: FormData,
): Promise<OrgActionState> {
  const ctx = await requestContext();
  const result = await renameProject(
    { projectId: field(formData, 'projectId'), name: field(formData, 'name') },
    ctx,
  );
  if (!result.ok) return refuse(result);
  revalidatePath('/admin/projects');
  return OK;
}

export async function reassignProjectProgramAction(
  _prev: OrgActionState,
  formData: FormData,
): Promise<OrgActionState> {
  const ctx = await requestContext();
  const result = await reassignProjectProgram(
    {
      projectId: field(formData, 'projectId'),
      programId: optionalId(formData, 'programId'),
    },
    ctx,
  );
  if (!result.ok) return refuse(result);
  revalidatePath('/admin/projects');
  return OK;
}

export async function reassignProjectDepartmentAction(
  _prev: OrgActionState,
  formData: FormData,
): Promise<OrgActionState> {
  const ctx = await requestContext();
  const result = await reassignProjectDepartment(
    {
      projectId: field(formData, 'projectId'),
      departmentId: field(formData, 'departmentId'),
      programId: optionalId(formData, 'programId'),
    },
    ctx,
  );
  if (!result.ok) return refuse(result);
  revalidatePath('/admin/projects');
  return OK;
}
