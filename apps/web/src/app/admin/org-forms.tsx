'use client';

/**
 * Organisation Admin forms (story 2.17). Plain React text; refuse messages stay inline.
 * Client so `useActionState` can show the use-case refuse without a full navigation.
 */
import { useTranslations } from 'next-intl';
import { useActionState, useState, type ReactNode } from 'react';
import {
  createDepartmentAction,
  createProgramAction,
  createProjectAction,
  INITIAL_ORG_ACTION,
  reassignProjectDepartmentAction,
  reassignProjectProgramAction,
  renameDepartmentAction,
  renameProgramAction,
  renameProjectAction,
  type OrgActionState,
} from './actions';
import { programsForDepartment } from './org-form-fields';

function Refuse({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <p className="org-form-error" role="alert" data-testid="org-form-error">
      {error}
    </p>
  );
}

function OrgForm({
  action,
  children,
  testId,
  ariaLabel,
  remountToken,
  submitLabel,
}: {
  action: (prev: OrgActionState, formData: FormData) => Promise<OrgActionState>;
  children: ReactNode;
  testId: string;
  ariaLabel?: string;
  /** Server props that must remount uncontrolled fields when RSC refreshes. */
  remountToken?: string;
  submitLabel: string;
}) {
  const t = useTranslations();
  const [state, formAction, pending] = useActionState(action, INITIAL_ORG_ACTION);
  return (
    <form
      key={`${state.resetKey}-${remountToken ?? ''}`}
      action={formAction}
      className="org-form"
      data-testid={testId}
      noValidate
      aria-label={ariaLabel}
    >
      {children}
      <Refuse error={state.error} />
      <button type="submit" className="btn" disabled={pending}>
        {pending ? t('admin.org.saving') : submitLabel}
      </button>
    </form>
  );
}

export function CreateDepartmentForm() {
  const t = useTranslations();
  return (
    <OrgForm
      action={createDepartmentAction}
      testId="create-department-form"
      submitLabel={t('admin.org.create_department')}
    >
      <label>
        {t('admin.org.name')}
        <input name="name" type="text" required autoComplete="off" />
      </label>
    </OrgForm>
  );
}

export function RenameDepartmentForm({
  departmentId,
  name,
}: {
  departmentId: string;
  name: string;
}) {
  const t = useTranslations();
  return (
    <OrgForm
      action={renameDepartmentAction}
      testId={`rename-department-${departmentId}`}
      ariaLabel={t('admin.org.rename_named', { name })}
      remountToken={name}
      submitLabel={t('admin.org.save')}
    >
      <input type="hidden" name="departmentId" value={departmentId} />
      <label>
        {t('admin.org.name')}
        <input name="name" type="text" defaultValue={name} required autoComplete="off" />
      </label>
    </OrgForm>
  );
}

export function CreateProgramForm({
  departments,
}: {
  departments: readonly { id: string; name: string }[];
}) {
  const t = useTranslations();
  if (departments.length === 0) {
    return (
      <p className="org-form-hint" data-testid="create-program-needs-department">
        {t('admin.org.needs_department_first')}
      </p>
    );
  }
  return (
    <OrgForm
      action={createProgramAction}
      testId="create-program-form"
      submitLabel={t('admin.org.create_program')}
    >
      <label>
        {t('admin.org.department')}
        <select name="departmentId" required defaultValue="">
          <option value="" disabled>
            {t('admin.org.choose_department')}
          </option>
          {departments.map((dep) => (
            <option key={dep.id} value={dep.id}>
              {dep.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        {t('admin.org.name')}
        <input name="name" type="text" required autoComplete="off" />
      </label>
    </OrgForm>
  );
}

export function RenameProgramForm({ programId, name }: { programId: string; name: string }) {
  const t = useTranslations();
  return (
    <OrgForm
      action={renameProgramAction}
      testId={`rename-program-${programId}`}
      ariaLabel={t('admin.org.rename_named', { name })}
      remountToken={name}
      submitLabel={t('admin.org.save')}
    >
      <input type="hidden" name="programId" value={programId} />
      <label>
        {t('admin.org.name')}
        <input name="name" type="text" defaultValue={name} required autoComplete="off" />
      </label>
    </OrgForm>
  );
}

function CreateProjectFields({
  departments,
  programs,
}: {
  departments: readonly { id: string; name: string }[];
  programs: readonly { id: string; departmentId: string; name: string }[];
}) {
  const t = useTranslations();
  const [departmentId, setDepartmentId] = useState('');
  const programsInDept = programsForDepartment(programs, departmentId);
  return (
    <>
      <label>
        {t('admin.org.name')}
        <input name="name" type="text" required autoComplete="off" />
      </label>
      <label>
        {t('admin.org.client_name')}
        <input name="clientName" type="text" required autoComplete="off" />
      </label>
      <label>
        {t('admin.org.contract_type')}
        <select name="contractType" defaultValue="請負">
          <option value="請負">{t('admin.org.contract_ukeoi')}</option>
          <option value="準委任">{t('admin.org.contract_juninin')}</option>
        </select>
      </label>
      <label>
        {t('admin.org.department')}
        <select
          name="departmentId"
          required
          value={departmentId}
          onChange={(event) => setDepartmentId(event.target.value)}
        >
          <option value="" disabled>
            {t('admin.org.choose_department')}
          </option>
          {departments.map((dep) => (
            <option key={dep.id} value={dep.id}>
              {dep.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        {t('admin.org.program_optional')}
        <select name="programId" key={departmentId} defaultValue="">
          <option value="">{t('admin.org.no_program')}</option>
          {programsInDept.map((prog) => (
            <option key={prog.id} value={prog.id}>
              {prog.name}
            </option>
          ))}
        </select>
      </label>
    </>
  );
}

export function CreateProjectForm({
  departments,
  programs,
}: {
  departments: readonly { id: string; name: string }[];
  programs: readonly { id: string; departmentId: string; name: string }[];
}) {
  const t = useTranslations();
  if (departments.length === 0) {
    return (
      <p className="org-form-hint" data-testid="create-project-needs-department">
        {t('admin.org.needs_department_first')}
      </p>
    );
  }
  return (
    <OrgForm
      action={createProjectAction}
      testId="create-project-form"
      submitLabel={t('admin.org.create_project')}
    >
      <CreateProjectFields departments={departments} programs={programs} />
    </OrgForm>
  );
}

export function RenameProjectForm({ projectId, name }: { projectId: string; name: string }) {
  const t = useTranslations();
  return (
    <OrgForm
      action={renameProjectAction}
      testId={`rename-project-${projectId}`}
      ariaLabel={t('admin.org.rename_named', { name })}
      remountToken={name}
      submitLabel={t('admin.org.save')}
    >
      <input type="hidden" name="projectId" value={projectId} />
      <label>
        {t('admin.org.name')}
        <input name="name" type="text" defaultValue={name} required autoComplete="off" />
      </label>
    </OrgForm>
  );
}

export function ReassignProgramForm({
  projectId,
  departmentId,
  programId,
  programs,
  projectName,
}: {
  projectId: string;
  departmentId: string;
  programId: string | null;
  programs: readonly { id: string; departmentId: string; name: string }[];
  projectName: string;
}) {
  const t = useTranslations();
  const sameDept = programsForDepartment(programs, departmentId);
  return (
    <OrgForm
      action={reassignProjectProgramAction}
      testId={`reassign-program-${projectId}`}
      ariaLabel={t('admin.org.reassign_program_named', { name: projectName })}
      remountToken={`${departmentId}:${programId ?? ''}`}
      submitLabel={t('admin.org.save')}
    >
      <input type="hidden" name="projectId" value={projectId} />
      <label>
        {t('admin.org.program')}
        <select name="programId" defaultValue={programId ?? ''}>
          <option value="">{t('admin.org.no_program')}</option>
          {sameDept.map((prog) => (
            <option key={prog.id} value={prog.id}>
              {prog.name}
            </option>
          ))}
        </select>
      </label>
    </OrgForm>
  );
}

function ReassignDepartmentFields({
  departmentId,
  programId,
  departments,
  programs,
}: {
  departmentId: string;
  programId: string | null;
  departments: readonly { id: string; name: string }[];
  programs: readonly { id: string; departmentId: string; name: string }[];
}) {
  const t = useTranslations();
  const [selectedDepartmentId, setSelectedDepartmentId] = useState(departmentId);
  const programsInDept = programsForDepartment(programs, selectedDepartmentId);
  const initialProgram =
    programId !== null && programsInDept.some((p) => p.id === programId) ? programId : '';
  return (
    <>
      <label>
        {t('admin.org.department')}
        <select
          name="departmentId"
          required
          value={selectedDepartmentId}
          onChange={(event) => setSelectedDepartmentId(event.target.value)}
        >
          {departments.map((dep) => (
            <option key={dep.id} value={dep.id}>
              {dep.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        {t('admin.org.program_optional')}
        <select name="programId" key={selectedDepartmentId} defaultValue={initialProgram}>
          <option value="">{t('admin.org.no_program')}</option>
          {programsInDept.map((prog) => (
            <option key={prog.id} value={prog.id}>
              {prog.name}
            </option>
          ))}
        </select>
      </label>
    </>
  );
}

export function ReassignDepartmentForm({
  projectId,
  departmentId,
  programId,
  departments,
  programs,
  projectName,
}: {
  projectId: string;
  departmentId: string;
  programId: string | null;
  departments: readonly { id: string; name: string }[];
  programs: readonly { id: string; departmentId: string; name: string }[];
  projectName: string;
}) {
  const t = useTranslations();
  return (
    <OrgForm
      action={reassignProjectDepartmentAction}
      testId={`reassign-department-${projectId}`}
      ariaLabel={t('admin.org.reassign_department_named', { name: projectName })}
      remountToken={`${departmentId}:${programId ?? ''}`}
      submitLabel={t('admin.org.save')}
    >
      <input type="hidden" name="projectId" value={projectId} />
      <ReassignDepartmentFields
        departmentId={departmentId}
        programId={programId}
        departments={departments}
        programs={programs}
      />
    </OrgForm>
  );
}
