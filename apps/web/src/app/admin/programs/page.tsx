import { getTranslations } from 'next-intl/server';
/**
 * Admin: Programs (story 2.17). Ledger-Paper list + create/rename through existing org writes.
 */
import { notFound } from 'next/navigation';
import { listDepartments, listPrograms, requestContext } from '@/server/composition';
import { CreateProgramForm, RenameProgramForm } from '../org-forms';

export const dynamic = 'force-dynamic';

export default async function ProgramsPage() {
  const t = await getTranslations();
  const ctx = await requestContext();
  const [programsResult, departmentsResult] = await Promise.all([
    listPrograms(ctx),
    listDepartments(ctx),
  ]);
  if (!programsResult.ok || !departmentsResult.ok) {
    return notFound();
  }

  const { rows } = programsResult.value;
  const departments = departmentsResult.value.rows;
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
