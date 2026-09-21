'use client';

import { useActionState } from 'react';
import { signIn, type SignInState } from './actions';

const INITIAL: SignInState = { refused: false };

/** The email + password form. The one refusal message never says which half was wrong. */
export function SignInForm() {
  const [state, action, pending] = useActionState(signIn, INITIAL);

  return (
    <form action={action} className="auth-form" noValidate>
      <label className="auth-field">
        <span>Email</span>
        <input type="email" name="email" autoComplete="username" required autoFocus />
      </label>
      <label className="auth-field">
        <span>Password</span>
        <input type="password" name="password" autoComplete="current-password" required />
      </label>
      {state.refused ? (
        <p className="auth-error" role="alert">
          That email and password do not match an account. Check both and try again.
        </p>
      ) : null}
      <button type="submit" className="btn primary auth-submit" disabled={pending}>
        {pending ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  );
}
