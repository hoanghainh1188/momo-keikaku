import { getTranslations } from 'next-intl/server';
/**
 * Admin: Projects (story 2.17). Ledger-Paper list + create/rename/reassign through existing
 * org writes. PM assignment stays deferred (Q2→B).
 */
import {
  listDepartments,
  listPrograms,
  listProjects,
  requestContext,
} from '@/server/composition';
import { valueOrNotFound } from '@/server/result';
import {
  CreateProjectForm,
  ReassignDepartmentForm,
  ReassignProgramForm,
  RenameProjectForm,
} from '../org-forms';

export const dynamic = 'force-dynamic';

export default async function ProjectsPage() {
  const t = await getTranslations();
  const ctx = await requestContext();
  const [projectsPage, departmentsPage, programsPage] = await Promise.all([
    listProjects(ctx),
    listDepartments(ctx),
    listPrograms(ctx),
  ]);
  const { rows } = valueOrNotFound(projectsPage);
  const departments = valueOrNotFound(departmentsPage).rows;
  const programs = valueOrNotFound(programsPage).rows.map((p) => ({
    id: p.id,
    departmentId: p.departmentId,
    name: p.name,
  }));
  const em = t('common.em_dash');

  return (
    <div data-testid="admin-projects">
      <h1 className="page-title">{t('admin.org.projects')}</h1>
      <p className="lede">{t('admin.org.projects_lede')}</p>

      <section className="org-create" aria-labelledby="create-project-heading">
        <h2 id="create-project-heading" className="section-title">
          {t('admin.org.create_project')}
        </h2>
        <CreateProjectForm departments={departments} programs={programs} />
      </section>

      <table className="ledger" data-testid="projects-table">
        <thead>
          <tr>
            <th>{t('admin.org.name')}</th>
            <th>{t('admin.org.department')}</th>
            <th>{t('admin.org.program')}</th>
            <th>{t('admin.org.rename')}</th>
            <th>{t('admin.org.reassign_program')}</th>
            <th>{t('admin.org.reassign_department')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={6} style={{ color: 'var(--ink-muted)' }}>
                {t('admin.org.no_projects')}
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr key={row.id}>
                <td>{row.name}</td>
                <td>{row.departmentName}</td>
                <td>{row.programName ?? em}</td>
                <td>
                  <RenameProjectForm projectId={row.id} name={row.name} />
                </td>
                <td>
                  <ReassignProgramForm
                    projectId={row.id}
                    departmentId={row.departmentId}
                    programId={row.programId}
                    programs={programs}
                    projectName={row.name}
                  />
                </td>
                <td>
                  <ReassignDepartmentForm
                    projectId={row.id}
                    departmentId={row.departmentId}
                    programId={row.programId}
                    departments={departments}
                    programs={programs}
                    projectName={row.name}
                  />
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
