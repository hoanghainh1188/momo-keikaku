import { buildResetPasswordMail } from '@momo/i18n';
import { resetPasswordExpiryHours } from '@momo/db-auth';
/** Shared reset-mail renderer for Postgres auth suites (story 1.9). */
export function testResetPasswordMailRenderer() {
    const hours = resetPasswordExpiryHours();
    return {
        render: ({ locale, to, link, }) => buildResetPasswordMail(locale, { to, link }, hours),
    };
}
