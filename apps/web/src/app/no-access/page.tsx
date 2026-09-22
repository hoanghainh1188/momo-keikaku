import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { signInState } from '@/server/composition';

export const dynamic = 'force-dynamic';

export async function generateMetadata() {
  const t = await getTranslations('auth.noAccess');
  return { title: t('no_access_momo_keikaku') };
}

/**
 * `/no-access` (story 1.4 slice 1): where a signed-in user with no Tenant to act in lands — zero
 * memberships, or several and no tenant switcher yet. It says so plainly and nothing more (the
 * reason for "several" is logged, not shown). It reads the NON-redirecting sign-in state, never
 * the redirecting resolver, so it cannot loop; the root layout's sign-out control is the way out.
 */
export default async function NoAccessPage() {
  const t = await getTranslations();
  const state = await signInState();

  return (
    <main className="auth-page">
      <section className="auth-sheet" aria-labelledby="no-access-heading">
        <p className="auth-brand">{t('admin.momo_keikaku')}<span>{t('shell.brandSuffix')}</span>
        </p>
        <h1 id="no-access-heading">{t('auth.noAccess.no_access')}</h1>
        {state === 'signed_out' ? (
          <p className="auth-note">{t('auth.noAccess.you_are_not_signed_in')}<Link href="/sign-in">{t('auth.noAccess.sign_in')}</Link>
          </p>
        ) : (
          <p className="auth-note">{t('auth.noAccess.you_are_signed_in_but_no_workspace_can_be_opened')}</p>
        )}
      </section>
    </main>
  );
}
