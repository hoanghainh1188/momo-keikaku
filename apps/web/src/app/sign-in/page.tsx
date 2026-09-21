import { SignInForm } from './sign-in-form';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Sign in · momo-keikaku' };

/**
 * `/sign-in` (story 1.4 slice 1). Public, and it NEVER redirects on its own — not even a signed-in
 * visitor — so a stale or tampered session can never bounce between it and a protected page.
 */
export default function SignInPage() {
  return (
    <main className="auth-page">
      <section className="auth-sheet" aria-labelledby="sign-in-heading">
        <p className="auth-brand">
          momo-keikaku <span>／ 計画</span>
        </p>
        <h1 id="sign-in-heading">Sign in</h1>
        <SignInForm />
      </section>
    </main>
  );
}
