/**
 * The reset link's lifetime in hours, as the forgot-password page states it.
 *
 * `@momo/db-auth` owns the number — `RESET_PASSWORD_TOKEN_EXPIRES_IN_SECONDS` — and derives the
 * mail copy from it, so the option and the mail can never disagree. This page cannot import that
 * package: AD-1 lets only the composition root do so, and a route module is not it. So the number
 * is stated a second time here, exactly as `GOOGLE_REFUSED` is, with a test pinning the two equal
 * (`tests/web-composition.test.ts`). It lives in its own module rather than in `page.tsx` because
 * Next allows a page module only its own reserved exports.
 */
export const RESET_LINK_HOURS = 1;
