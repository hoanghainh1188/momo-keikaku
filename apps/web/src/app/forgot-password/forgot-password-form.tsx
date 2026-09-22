'use client';

import { useTranslations } from 'next-intl';

import { useFormStatus } from 'react-dom';
import { requestReset } from './actions';

function SubmitButton() {
  const t = useTranslations();
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn primary auth-submit" disabled={pending}>
      {pending ? t('auth.forgotPassword.sending') : t('auth.forgotPassword.submit')}
    </button>
  );
}

/** The one field. The action always redirects to the same generic outcome (see `actions.ts`). */
export function ForgotPasswordForm() {
  const t = useTranslations();
  return (
    <form action={requestReset} className="auth-form" noValidate>
      <label className="auth-field">
        <span>{t('auth.forgotPassword.email')}</span>
        <input type="email" name="email" autoComplete="username" required autoFocus />
      </label>
      <SubmitButton />
    </form>
  );
}
