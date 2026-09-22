/**
 * Top-bar identity chip helpers (story 1.7). Name preferred; email when name is blank.
 * Kept pure so the matrix row ("Chip shows name (or email) · role") has an observing test.
 */

export function userLabelFromIdentity(
  identity: { readonly name: string; readonly email: string } | null,
): string | undefined {
  if (identity === null) return undefined;
  const name = identity.name.trim();
  return name.length > 0 ? name : identity.email;
}

/** Formats the chip text: `Name · Role` when a user label exists, otherwise the role alone. */
export function formatUserChip(userLabel: string | undefined, roleLabel: string): string {
  return userLabel ? `${userLabel} · ${roleLabel}` : roleLabel;
}
