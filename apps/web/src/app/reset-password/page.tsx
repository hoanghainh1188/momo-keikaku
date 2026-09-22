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
            That did not work. The link may have been used already or expired, or the password may
            have been too short. <Link href="/forgot-password">Request a new link</Link> if you need
            one.
          </p>
        ) : null}
        {/* NO TOKEN, NO FORM. Rendering it anyway gave a visitor who arrived without one — a
            truncated link, a bare `/reset-password` — a field that could only ever be refused, and
            the refusal returned them to the very same empty form. There is nothing to submit here
            without a token, so offer the thing that produces one instead. */}
        {token === '' ? (
          <p className="auth-note">
            This page needs the link from your reset email.{' '}
            <Link href="/forgot-password">Request one</Link>.
          </p>
        ) : (
          <ResetPasswordForm token={token} />
        )}
        <p className="auth-below auth-note">
          <Link href="/sign-in">Back to sign in</Link>
        </p>
      </section>
    </main>
  );
}
