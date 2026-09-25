/**
 * Map a failed plan write outcome to under-cell / announce prose.
 * Prefer `details.refuse[0]` (FR-6a UX-DR6 sentences) over catalog messageKey.
 */
export function planWriteRefuseMessage(outcome: {
  readonly messageKey: string;
  readonly details?: Readonly<Record<string, readonly string[]>>;
}): string {
  const refuse = outcome.details?.refuse?.[0];
  if (refuse) return refuse;
  if (outcome.details !== undefined) {
    const parts = Object.entries(outcome.details).map(
      ([key, values]) => `${key}: ${values.join(', ')}`,
    );
    if (parts.length > 0) return parts.join('; ');
  }
  return outcome.messageKey;
}
