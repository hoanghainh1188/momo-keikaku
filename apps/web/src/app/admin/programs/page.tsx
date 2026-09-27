import { getTranslations } from 'next-intl/server';
/**
 * Admin: Programs (story 2.17). Ledger-Paper list + create/rename through existing org writes.
 */
import { listDepartments, listPrograms, requestContext } from '@/server/composition';
import { valueOrNotFound } from '@/server/result';
import { CreateProgramForm, RenameProgramForm } from '../org-forms';

export const dynamic = 'force-dynamic';

export default async function ProgramsPage() {
  const t = await getTranslations();
  const ctx = await requestContext();
  const [programsPage, departmentsPage] = await Promise.all([
    listPrograms(ctx),
    listDepartments(ctx),
  ]);
  const { rows } = valueOrNotFound(programsPage);
  const departments = valueOrNotFound(departmentsPage).rows;
  return (
    <div data-testid="admin-programs">
      <h1 className="page-title">{t('admin.org.programs')}</h1>
      <p className="lede">{t('admin.org.programs_lede')}</p>

      <section className="org-create" aria-labelledby="create-program-heading">
        <h2 id="create-program-heading" className="section-title">
          {t('admin.org.create_program')}
        </h2>
        <CreateProgramForm departments={departments} />
      </section>

      <table className="ledger" data-testid="programs-table">
        <thead>
          <tr>
            <th>{t('admin.org.name')}</th>
            <th>{t('admin.org.department')}</th>
            <th>{t('admin.org.rename')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={3} style={{ color: 'var(--ink-muted)' }}>
                {t('admin.org.no_programs')}
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr key={row.id}>
                <td>{row.name}</td>
                <td>{row.departmentName}</td>
                <td>
                  <RenameProgramForm programId={row.id} name={row.name} />
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
