import { buildResetPasswordMail } from '@momo/i18n';
import { resetPasswordExpiryHours, type ResetPasswordMailRenderer } from '@momo/db-auth';

/** Shared reset-mail renderer for Postgres auth suites (story 1.9). */
export function testResetPasswordMailRenderer(): ResetPasswordMailRenderer {
  const hours = resetPasswordExpiryHours();
  return {
    render: ({
      locale,
      to,
      link,
    }: {
      readonly locale: string;
      readonly to: string;
      readonly link: string;
    }) => buildResetPasswordMail(locale, { to, link }, hours),
  };
}
