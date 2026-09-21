/**
 * Whether `/sign-in` was reached from a refused Google sign-in (story 1.4 slice 3). Every refusal
 * — an unknown or unverified email, a bad token, a forged or expired state, the provider's own
 * error — lands on `/sign-in?google=refused`, and the page shows ONE generic message for all of
 * them. Better Auth appends its own `error` (and sometimes `error_description`) to that URL; the
 * page never reads or renders either.
 *
 * `searchParams.google` is a string, a string array when the key repeats, or absent.
 */
export function isGoogleRefusal(value: string | readonly string[] | undefined): boolean {
  if (value === undefined) return false;
  return typeof value === 'string' ? value === 'refused' : value.includes('refused');
}
