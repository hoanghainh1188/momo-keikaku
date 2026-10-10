/**
 * Where a refused Google sign-in lands. The SAME string as `@momo/db-auth`'s `GOOGLE_REFUSED_URL`
 * (`google.ts`), which Better Auth reads as `onAPIError.errorURL` — but a second declaration
 * rather than an import, because AD-1 lets only the composition root import that package and this
 * is a route module. `tests/web-composition.test.ts` asserts the two are equal, so they cannot
 * drift silently; it is the test, not a shared symbol, that keeps them honest.
 */
export const GOOGLE_REFUSED = '/sign-in?google=refused';
/**
 * Whether `/sign-in` was reached from a refused Google sign-in (story 1.4 slice 3). Every refusal
 * — an unknown or unverified email, a bad token, a forged or expired state, the provider's own
 * error — lands on `/sign-in?google=refused`, and the page shows ONE generic message for all of
 * them. Better Auth appends its own `error` (and sometimes `error_description`) to that URL; the
 * page never reads or renders either.
 *
 * `searchParams.google` is a string, a string array when the key repeats, or absent.
 */
export function isGoogleRefusal(value) {
    if (value === undefined)
        return false;
    return typeof value === 'string' ? value === 'refused' : value.includes('refused');
}
