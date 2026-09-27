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
import { field, optionalId, parseContractType } from './org-form-fields';

export type OrgActionState = {
  readonly error: string | null;
  /** Bumped on success so uncontrolled fields remount empty. */
  readonly resetKey: number;
};

export const INITIAL_ORG_ACTION: OrgActionState = { error: null, resetKey: 0 };

function refuse(prev: OrgActionState, messageKey: 'errors.not_found' | 'errors.invalid_input'): OrgActionState {
  return { error: messageFromKey(messageKey), resetKey: prev.resetKey };
}

function refuseResult(
  prev: OrgActionState,
  result: {
    readonly ok: false;
    readonly error: { readonly messageKey: 'errors.not_found' | 'errors.invalid_input' };
  },
): OrgActionState {
  return refuse(prev, result.error.messageKey);
}

function ok(prev: OrgActionState): OrgActionState {
  return { error: null, resetKey: prev.resetKey + 1 };
}

export async function createDepartmentAction(
  prev: OrgActionState,
  formData: FormData,
): Promise<OrgActionState> {
  const ctx = await requestContext();
  const result = await createDepartment({ name: field(formData, 'name') }, ctx);
  if (!result.ok) return refuseResult(prev, result);
  revalidatePath('/admin/departments');
  return ok(prev);
}

export async function renameDepartmentAction(
  prev: OrgActionState,
  formData: FormData,
): Promise<OrgActionState> {
  const ctx = await requestContext();
  const result = await renameDepartment(
    { departmentId: field(formData, 'departmentId'), name: field(formData, 'name') },
    ctx,
  );
  if (!result.ok) return refuseResult(prev, result);
  revalidatePath('/admin/departments');
  return ok(prev);
}

export async function createProgramAction(
  prev: OrgActionState,
  formData: FormData,
): Promise<OrgActionState> {
  const ctx = await requestContext();
  const result = await createProgram(
    { departmentId: field(formData, 'departmentId'), name: field(formData, 'name') },
    ctx,
  );
  if (!result.ok) return refuseResult(prev, result);
  revalidatePath('/admin/programs');
  return ok(prev);
}

export async function renameProgramAction(
  prev: OrgActionState,
  formData: FormData,
): Promise<OrgActionState> {
  const ctx = await requestContext();
  const result = await renameProgram(
    { programId: field(formData, 'programId'), name: field(formData, 'name') },
    ctx,
  );
  if (!result.ok) return refuseResult(prev, result);
  revalidatePath('/admin/programs');
  return ok(prev);
}

export async function createProjectAction(
  prev: OrgActionState,
  formData: FormData,
): Promise<OrgActionState> {
  const contractType = parseContractType(field(formData, 'contractType'));
  if (contractType === null) return refuse(prev, 'errors.invalid_input');

  const ctx = await requestContext();
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
  if (!result.ok) return refuseResult(prev, result);
  revalidatePath('/admin/projects');
  return ok(prev);
}

export async function renameProjectAction(
  prev: OrgActionState,
  formData: FormData,
): Promise<OrgActionState> {
  const ctx = await requestContext();
  const result = await renameProject(
    { projectId: field(formData, 'projectId'), name: field(formData, 'name') },
    ctx,
  );
  if (!result.ok) return refuseResult(prev, result);
  revalidatePath('/admin/projects');
  return ok(prev);
}

export async function reassignProjectProgramAction(
  prev: OrgActionState,
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
  if (!result.ok) return refuseResult(prev, result);
  revalidatePath('/admin/projects');
  return ok(prev);
}

export async function reassignProjectDepartmentAction(
  prev: OrgActionState,
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
  if (!result.ok) return refuseResult(prev, result);
  revalidatePath('/admin/projects');
  return ok(prev);
}
