import { googleEnabled } from '@/server/composition';
import { isGoogleRefusal } from './google-refusal';
import { GoogleSignIn } from './google-sign-in';
import { SignInForm } from './sign-in-form';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Sign in · momo-keikaku' };

interface SignInPageProps {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * `/sign-in` (story 1.4 slices 1 and 3). Public, and it NEVER redirects on its own — not even a
 * signed-in visitor — so a stale or tampered session can never bounce between it and a protected
 * page.
 *
 * "Sign in with Google" appears only while the provider is registered (`AUTH_GOOGLE=on` and its
 * discovery succeeded). A refused Google sign-in comes back here with `?google=refused` and gets
 * one generic message; Better Auth's `error`/`error_description` parameters are never read.
 */
export default async function SignInPage({ searchParams }: SignInPageProps) {
  const [google, params] = await Promise.all([googleEnabled(), searchParams]);
  const googleRefused = isGoogleRefusal(params.google);

  return (
    <main className="auth-page">
      <section className="auth-sheet" aria-labelledby="sign-in-heading">
        <p className="auth-brand">
          momo-keikaku <span>／ 計画</span>
        </p>
        <h1 id="sign-in-heading">Sign in</h1>
        {googleRefused ? (
          <p className="auth-error auth-error-google" role="alert">
            Google sign-in did not go through. Try again, or sign in with your email and password.
          </p>
        ) : null}
        <SignInForm />
        {google ? <GoogleSignIn /> : null}
      </section>
    </main>
  );
}
