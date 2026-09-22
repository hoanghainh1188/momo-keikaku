import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { RESET_LINK_HOURS } from './reset-link-hours';

import { ForgotPasswordForm } from './forgot-password-form';

export const dynamic = 'force-dynamic';

export async function generateMetadata() {
  const t = await getTranslations('auth.forgotPassword');
  return { title: t('forgot_password_momo_keikaku') };
}

interface ForgotPasswordPageProps {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * `/forgot-password` (story 1.4 slice 4). Public — a signed-out visitor is exactly who needs
 * this — and, like `/sign-in`, it never redirects on its own.
 *
 * ONE GENERIC SENTENCE answers every request: a known email, an unknown one, and a Google-only
 * account with no credential all reach `?sent=1` (NFR-S5) — nothing on this page, or in the
 * action behind it, tells them apart.
 */
export default async function ForgotPasswordPage({ searchParams }: ForgotPasswordPageProps) {
  const t = await getTranslations();
  const params = await searchParams;
  const sent = params.sent !== undefined;

  return (
    <main className="auth-page">
      <section className="auth-sheet" aria-labelledby="forgot-password-heading">
        <p className="auth-brand">{t('admin.momo_keikaku')}<span>{t('shell.brandSuffix')}</span>
        </p>
        <h1 id="forgot-password-heading">{t('auth.forgotPassword.reset_your_password')}</h1>
        {sent ? (
          <p className="auth-success" role="status">
            {RESET_LINK_HOURS === 1
              ? t('auth.forgotPassword.sent.oneHour')
              : t('auth.forgotPassword.sent.manyHours', { hours: RESET_LINK_HOURS })}
          </p>
        ) : (
          <>
            <p className="auth-hint">{t('auth.forgotPassword.enter_the_email_you_sign_in_with')}</p>
            <ForgotPasswordForm />
          </>
        )}
        <p className="auth-below auth-note">
          <Link href="/sign-in">{t('auth.forgotPassword.back_to_sign_in')}</Link>
        </p>
      </section>
    </main>
  );
}
