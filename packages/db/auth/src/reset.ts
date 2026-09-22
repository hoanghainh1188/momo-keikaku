/**
 * PASSWORD RESET, THE PURE PIECES (story 1.4 slice 4), as `google.ts` keeps `discoveryUrlOf`: the
 * product's own reset link, and the mail copy — hardcoded English, one builder, unit-tested. No
 * `@momo/app` import (this package may import neither it nor `@momo/adapters`): the interfaces
 * below restate the shapes `CreateAuthOptions` needs structurally, exactly as `GoogleProviderOptions`
 * restates `@momo/app`'s `GoogleProviderConfig`.
 *
 * WHY OUR OWN LINK. Better Auth's `requestPasswordReset` builds
 * `${baseURL}/reset-password/${token}?callbackURL=…`, a parametrised route under `/api/auth` that
 * `serveAllowlisted` 404s by design (`serveAllowlisted` matches an exact method and path; it
 * cannot express `/reset-password/:token`). The `token` argument is handed to `sendResetPassword`
 * separately, so the product builds its own page URL from it — never Better Auth's `url`.
 */

/**
 * The token's lifetime, in seconds — the ONE place it is a number. `auth.ts` passes this to
 * `resetPasswordTokenExpiresIn` and `resetPasswordMail` below reads its own copy from the same
 * constant, so the option and the mail's "expires in …" text cannot drift from each other.
 */
export const RESET_PASSWORD_TOKEN_EXPIRES_IN_SECONDS = 3600;

/** What `createAuth` needs to send a reset mail. `@momo/app`'s `MailerPort`, structurally. */
export interface ResetMailer {
  readonly send: (message: { readonly to: string; readonly subject: string; readonly text: string }) => Promise<void>;
}

/**
 * Where a completed reset is recorded. `@momo/db`'s `identityEventWriterOn(db)`, structurally —
 * this package may not import `@momo/db`'s writer as a value, only `Db` and the schema it already
 * does; the composition root builds the real one and hands it over.
 */
export interface IdentityEventWriter {
  readonly record: (event: {
    readonly id: string;
    readonly userId: string;
    readonly action: 'password.reset';
    readonly at: Date;
  }) => Promise<void>;
}

/**
 * The product's own `/reset-password?token=…` link, built from `sendResetPassword`'s `token`
 * argument. Trailing slashes on `baseURL` are stripped, so the path is never doubled.
 */
export function resetLinkOf(baseURL: string, token: string): string {
  return `${baseURL.replace(/\/+$/, '')}/reset-password?token=${encodeURIComponent(token)}`;
}

export interface ResetPasswordMailInput {
  readonly to: string;
  readonly link: string;
}

export interface ResetPasswordMail {
  readonly to: string;
  readonly subject: string;
  readonly text: string;
}

/** The lifetime as whole hours, for the mail copy — `RESET_PASSWORD_TOKEN_EXPIRES_IN_SECONDS` is a whole number of hours today; this throws rather than print a fraction if that ever stops being true. */
function expiryHours(): number {
  const hours = RESET_PASSWORD_TOKEN_EXPIRES_IN_SECONDS / 3600;
  if (!Number.isInteger(hours)) {
    throw new Error(
      `RESET_PASSWORD_TOKEN_EXPIRES_IN_SECONDS (${RESET_PASSWORD_TOKEN_EXPIRES_IN_SECONDS}) is not a whole number of hours; resetPasswordMail's copy assumes one.`,
    );
  }
  return hours;
}

/**
 * THE ONE MAIL COPY BUILDER (hardcoded English — `packages/i18n` is empty until story 1.9).
 * Pure: no clock, no environment, no randomness, so a test can assert its exact text. The
 * "expires in …" line reads `RESET_PASSWORD_TOKEN_EXPIRES_IN_SECONDS` — the same constant
 * `resetPasswordTokenExpiresIn` is built from — so the two cannot say different things.
 */
export function resetPasswordMail({ to, link }: ResetPasswordMailInput): ResetPasswordMail {
  const hours = expiryHours();
  return {
    to,
    subject: 'Reset your momo-keikaku password',
    text: [
      'We received a request to reset your momo-keikaku password.',
      '',
      `Reset it here: ${link}`,
      '',
      `This link expires in ${hours} hour${hours === 1 ? '' : 's'} and can be used once. If you ` +
        'did not request this, you can ignore this email — your password will not change.',
    ].join('\n'),
  };
}
