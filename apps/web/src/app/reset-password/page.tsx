import Link from 'next/link';
import { ResetPasswordForm } from './reset-password-form';
import { tokenOf } from './reset-token';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Reset password · momo-keikaku' };

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
  const params = await searchParams;
  const token = tokenOf(params.token);
  const refused = params.refused !== undefined;

  return (
    <main className="auth-page">
      <section className="auth-sheet" aria-labelledby="reset-password-heading">
        <p className="auth-brand">
          momo-keikaku <span>／ 計画</span>
        </p>
        <h1 id="reset-password-heading">Choose a new password</h1>
        {refused ? (
          <p className="auth-error" role="alert">
            That link no longer works, or the password was too short.{' '}
            <Link href="/forgot-password">Request a new link</Link> and try again.
          </p>
        ) : null}
        <ResetPasswordForm token={token} />
        <p className="auth-below auth-note">
          <Link href="/sign-in">Back to sign in</Link>
        </p>
      </section>
    </main>
  );
}
