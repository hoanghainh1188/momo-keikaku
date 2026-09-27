import { getTranslations } from 'next-intl/server';
/**
 * Admin: Departments (story 2.17). Ledger-Paper list + create/rename through existing org writes.
 */
import { listDepartments, requestContext } from '@/server/composition';
import { valueOrNotFound } from '@/server/result';
import { CreateDepartmentForm, RenameDepartmentForm } from '../org-forms';

export const dynamic = 'force-dynamic';

export default async function DepartmentsPage() {
  const t = await getTranslations();
  const ctx = await requestContext();
  const { rows } = valueOrNotFound(await listDepartments(ctx));
  return (
    <div data-testid="admin-departments">
      <h1 className="page-title">{t('admin.org.departments')}</h1>
      <p className="lede">{t('admin.org.departments_lede')}</p>

      <section className="org-create" aria-labelledby="create-department-heading">
        <h2 id="create-department-heading" className="section-title">
          {t('admin.org.create_department')}
        </h2>
        <CreateDepartmentForm />
      </section>

      <table className="ledger" data-testid="departments-table">
        <thead>
          <tr>
            <th>{t('admin.org.name')}</th>
            <th>{t('admin.org.rename')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={2} style={{ color: 'var(--ink-muted)' }}>
                {t('admin.org.no_departments')}
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr key={row.id}>
                <td>{row.name}</td>
                <td>
                  <RenameDepartmentForm departmentId={row.id} name={row.name} />
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
