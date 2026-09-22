import Link from 'next/link';
import { ForgotPasswordForm } from './forgot-password-form';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Forgot password · momo-keikaku' };

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
  const params = await searchParams;
  const sent = params.sent !== undefined;

  return (
    <main className="auth-page">
      <section className="auth-sheet" aria-labelledby="forgot-password-heading">
        <p className="auth-brand">
          momo-keikaku <span>／ 計画</span>
        </p>
        <h1 id="forgot-password-heading">Reset your password</h1>
        {sent ? (
          <p className="auth-success" role="status">
            If that email has an account, we&rsquo;ve sent a link to reset the password. It
            expires in 1 hour.
          </p>
        ) : (
          <>
            <p className="auth-hint">Enter the email you sign in with.</p>
            <ForgotPasswordForm />
          </>
        )}
        <p className="auth-below auth-note">
          <Link href="/sign-in">Back to sign in</Link>
        </p>
      </section>
    </main>
  );
}
