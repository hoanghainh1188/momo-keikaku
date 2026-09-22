'use client';

import { useFormStatus } from 'react-dom';
import { submitReset } from './actions';

/** Better Auth's `minPasswordLength` default, which the reset endpoint enforces. */
const MIN_PASSWORD_LENGTH = 8;

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
        {/* `minLength` states the bound Better Auth enforces (8). The action deliberately does not
            re-enforce it — that authority lives in one place — but leaving the number unsaid meant
            the only way to learn it was to be refused, and the refusal could not say which of its
            two causes applied. Stating it here prevents the common case instead of explaining it. */}
        <input
          type="password"
          name="password"
          autoComplete="new-password"
          minLength={MIN_PASSWORD_LENGTH}
          required
          autoFocus
        />
        <span className="auth-hint">At least {MIN_PASSWORD_LENGTH} characters.</span>
      </label>
      <SubmitButton />
    </form>
  );
}
