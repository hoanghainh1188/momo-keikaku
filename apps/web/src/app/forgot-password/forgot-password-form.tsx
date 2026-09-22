'use client';

import { useFormStatus } from 'react-dom';
import { requestReset } from './actions';

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn primary auth-submit" disabled={pending}>
      {pending ? 'Sending…' : 'Send reset link'}
    </button>
  );
}

/** The one field. The action always redirects to the same generic outcome (see `actions.ts`). */
export function ForgotPasswordForm() {
  return (
    <form action={requestReset} className="auth-form" noValidate>
      <label className="auth-field">
        <span>Email</span>
        <input type="email" name="email" autoComplete="username" required autoFocus />
      </label>
      <SubmitButton />
    </form>
  );
}
