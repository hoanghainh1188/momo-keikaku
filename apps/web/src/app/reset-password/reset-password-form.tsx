'use client';

import { useFormStatus } from 'react-dom';
import { submitReset } from './actions';

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn primary auth-submit" disabled={pending}>
      {pending ? 'Updating…' : 'Update password'}
    </button>
  );
}

/**
 * The token rides a HIDDEN field, set once from the page's own read of the URL
 * (`reset-token.ts`) — the action reads it from here, never from `searchParams` again.
 */
export function ResetPasswordForm({ token }: { readonly token: string }) {
  return (
    <form action={submitReset} className="auth-form" noValidate>
      <input type="hidden" name="token" value={token} />
      <label className="auth-field">
        <span>New password</span>
        <input type="password" name="password" autoComplete="new-password" required autoFocus />
      </label>
      <SubmitButton />
    </form>
  );
}
