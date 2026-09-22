'use client';

import { useTranslations } from 'next-intl';

import { useActionState } from 'react';
import Link from 'next/link';
import { signIn, type SignInState } from './actions';

const INITIAL: SignInState = { refused: false };

/** The email + password form. The one refusal message never says which half was wrong. */
export function SignInForm() {
  const t = useTranslations();
  const [state, action, pending] = useActionState(signIn, INITIAL);

  return (
    <form action={action} className="auth-form" noValidate>
      <label className="auth-field">
        <span>{t('auth.signIn.email')}</span>
        <input type="email" name="email" autoComplete="username" required autoFocus />
      </label>
      <label className="auth-field">
        <span>{t('auth.signIn.password')}</span>
        <input type="password" name="password" autoComplete="current-password" required />
      </label>
      {state.refused ? (
        <p className="auth-error" role="alert">{t('auth.signIn.that_email_and_password_do_not_match_an_account_')}</p>
      ) : null}
      <button type="submit" className="btn primary auth-submit" disabled={pending}>
        {pending ? t('auth.signIn.signingIn') : t('auth.signIn.submit')}
      </button>
      <p className="auth-below auth-note">
        <Link href="/forgot-password">{t('auth.signIn.forgot_your_password')}</Link>
      </p>
    </form>
  );
}
