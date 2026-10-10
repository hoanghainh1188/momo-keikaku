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
/**
 * The product's own `/reset-password?token=…` link, built from `sendResetPassword`'s `token`
 * argument. Trailing slashes on `baseURL` are stripped, so the path is never doubled.
 */
export function resetLinkOf(baseURL, token) {
    return `${baseURL.replace(/\/+$/, '')}/reset-password?token=${encodeURIComponent(token)}`;
}
/** Whole hours for mail copy — must match `RESET_PASSWORD_TOKEN_EXPIRES_IN_SECONDS`. */
export function resetPasswordExpiryHours() {
    const hours = RESET_PASSWORD_TOKEN_EXPIRES_IN_SECONDS / 3600;
    if (!Number.isInteger(hours)) {
        throw new Error(`RESET_PASSWORD_TOKEN_EXPIRES_IN_SECONDS (${RESET_PASSWORD_TOKEN_EXPIRES_IN_SECONDS}) is not a whole number of hours; reset mail copy assumes one.`);
    }
    return hours;
}
