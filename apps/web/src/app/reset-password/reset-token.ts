/**
 * The token `/reset-password?token=…` carries (story 1.4 slice 4) — `google-refusal.ts`'s pure
 * `string | string[]` reader, restated for this query key: `searchParams.token` is a string, a
 * string array when the key repeats, or absent.
 *
 * Read exactly ONCE, by the page, to pre-fill the form's hidden field. The action never re-reads
 * the URL — it reads that hidden field instead — which is what keeps a resubmission (or the
 * redirect back after a refusal) carrying the same token rather than whatever the address bar
 * happens to hold.
 */
export function tokenOf(value: string | readonly string[] | undefined): string {
  if (value === undefined) return '';
  return typeof value === 'string' ? value : (value[0] ?? '');
}
