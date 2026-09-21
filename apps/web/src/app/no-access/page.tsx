import Link from 'next/link';
import { signInState } from '@/server/composition';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'No access · momo-keikaku' };

/**
 * `/no-access` (story 1.4 slice 1): where a signed-in user with no Tenant to act in lands — zero
 * memberships, or several and no tenant switcher yet. It says so plainly and nothing more (the
 * reason for "several" is logged, not shown). It reads the NON-redirecting sign-in state, never
 * the redirecting resolver, so it cannot loop; the root layout's sign-out control is the way out.
 */
export default async function NoAccessPage() {
  const state = await signInState();

  return (
    <main className="auth-page">
      <section className="auth-sheet" aria-labelledby="no-access-heading">
        <p className="auth-brand">
          momo-keikaku <span>／ 計画</span>
        </p>
        <h1 id="no-access-heading">No access</h1>
        {state === 'signed_out' ? (
          <p className="auth-note">
            You are not signed in. <Link href="/sign-in">Sign in</Link>
          </p>
        ) : (
          <p className="auth-note">
            You are signed in, but no workspace can be opened for this account yet. Ask your
            Tenant Admin.
          </p>
        )}
      </section>
    </main>
  );
}
