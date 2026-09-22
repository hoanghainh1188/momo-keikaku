import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { ResetPasswordForm } from './reset-password-form';
import { tokenOf } from './reset-token';

export const dynamic = 'force-dynamic';

export async function generateMetadata() {
  const t = await getTranslations('auth.resetPassword');
  return { title: t('reset_password_momo_keikaku') };
}

interface ResetPasswordPageProps {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * `/reset-password?token=…` (story 1.4 slice 4). Public, and — like `/sign-in` — it never
 * redirects on its own. The link is the product's own (`resetLinkOf`), never Better Auth's `url`.
 *
 * ONE GENERIC REFUSAL: a reused token, an expired one, and a password Better Auth's
 * `minPasswordLength` refuses all land back here with `?refused=1`, told apart by nothing.
 */
export default async function ResetPasswordPage({ searchParams }: ResetPasswordPageProps) {
  const t = await getTranslations();
  const params = await searchParams;
  const token = tokenOf(params.token);
  const refused = params.refused !== undefined;

  return (
    <main className="auth-page">
      <section className="auth-sheet" aria-labelledby="reset-password-heading">
        <p className="auth-brand">{t('admin.momo_keikaku')}<span>{t('shell.brandSuffix')}</span>
        </p>
        <h1 id="reset-password-heading">{t('auth.resetPassword.choose_a_new_password')}</h1>
        {refused ? (
          <p className="auth-error" role="alert">{t('auth.resetPassword.that_did_not_work_the_link_may_have_been_used_al')}<Link href="/forgot-password">{t('auth.resetPassword.request_a_new_link')}</Link>{t('auth.resetPassword.if_you_need_one')}</p>
        ) : null}
        {token === '' ? (
          <p className="auth-note">
            {t('auth.resetPassword.needsLink')}{' '}
            <Link href="/forgot-password">{t('auth.resetPassword.request_one')}</Link>.
          </p>
        ) : (
          <ResetPasswordForm token={token} />
        )}
        <p className="auth-below auth-note">
          <Link href="/sign-in">{t('auth.forgotPassword.back_to_sign_in')}</Link>
        </p>
      </section>
    </main>
  );
}
