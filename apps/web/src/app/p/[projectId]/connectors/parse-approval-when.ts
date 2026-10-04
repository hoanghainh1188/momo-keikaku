/**
 * `datetime-local` is wall time without a zone. Treat bare values as UTC by appending `Z`.
 * Returns ISO instant, or null when empty/invalid.
 *
 * Kept outside the `"use server"` actions module — Next.js requires every export from
 * a Server Actions file to be async.
 */
export function parseApprovalWhen(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const withZone = /([zZ]|[+-]\d{2}:?\d{2})$/.test(trimmed) ? trimmed : `${trimmed}Z`;
  const when = new Date(withZone);
  if (Number.isNaN(when.getTime())) return null;
  return when.toISOString();
}
