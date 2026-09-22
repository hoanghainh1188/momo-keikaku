'use client';

import { useTranslations } from 'next-intl';
import { useFormStatus } from 'react-dom';
import { signInWithGoogle } from './actions';

function GoogleButton() {
  const t = useTranslations();
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn auth-google" disabled={pending}>
      {pending ? t('auth.signIn.openingGoogle') : t('auth.signIn.signInWithGoogle')}
    </button>
  );
}

/**
 * "Sign in with Google" (story 1.4 slice 3). A form posting the `signInWithGoogle` server action,
 * which starts the sign-in server-side and redirects to the provider. Rendered only when the
 * provider is registered (configured and discovered).
 */
export function GoogleSignIn() {
  const t = useTranslations();
  return (
    <form action={signInWithGoogle} className="auth-alt">
      <p className="auth-divider">
        <span>{t('auth.signIn.orDivider')}</span>
      </p>
      <GoogleButton />
    </form>
  );
}
