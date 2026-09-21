'use client';

import { useFormStatus } from 'react-dom';
import { signInWithGoogle } from './actions';

function GoogleButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn auth-google" disabled={pending}>
      {pending ? 'Opening Google…' : 'Sign in with Google'}
    </button>
  );
}

/**
 * "Sign in with Google" (story 1.4 slice 3). A form posting the `signInWithGoogle` server action,
 * which starts the sign-in server-side and redirects to the provider. Rendered only when the
 * provider is registered (configured and discovered).
 */
export function GoogleSignIn() {
  return (
    <form action={signInWithGoogle} className="auth-alt">
      <p className="auth-divider">
        <span>or</span>
      </p>
      <GoogleButton />
    </form>
  );
}
