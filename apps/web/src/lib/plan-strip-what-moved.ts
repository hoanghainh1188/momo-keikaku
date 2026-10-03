/**
 * Story 2.15 — client-side schedule strip / What-moved helpers.
 * Shared EN date/float formatters live in `@momo/domain/present` (Epic 2 retro F2/F5).
 */

/**
 * UX-DR23: blank derived date cells with "…" while a recalc is in flight — never paint
 * the previous early* value as if it were still current. Only blanks when there was a
 * date to replace (null stays "—").
 */
export function blankDerivedWhilePending(
  recalcPending: boolean,
  date: string | null,
): boolean {
  return recalcPending && date !== null;
}

export function formatRelativeAgo(atIso: string, nowMs: number): string {
  const at = Date.parse(atIso);
  if (Number.isNaN(at)) return '';
  const ms = Math.max(0, nowMs - at);
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes === 1) return '1 min ago';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours === 1) return '1 hour ago';
  if (hours < 48) return `${hours} hours ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return '1 day ago';
  return `${days} days ago`;
}

/** Prefer given name's first token for "edited by Hoang". */
export function shortActorName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return 'someone';
  return trimmed.split(/\s+/)[0] ?? trimmed;
}

/**
 * Exact What-moved attribution suffix for another PM's run (UX-DR23).
 * Own edit → empty string (no attribution). Other → ` · edited by Hoang, 3 min ago`.
 */
export function formatWhatMovedAttribution(input: {
  readonly currentUserId: string;
  readonly actorUserId: string;
  readonly actorName: string;
  readonly atIso: string;
  readonly nowMs: number;
}): string {
  if (input.actorUserId === input.currentUserId) return '';
  const ago = formatRelativeAgo(input.atIso, input.nowMs);
  const who = shortActorName(input.actorName);
  return ago ? ` · edited by ${who}, ${ago}` : ` · edited by ${who}`;
}

export function whatMovedDismissKey(projectId: string, runSeq: number): string {
  return `momo.plan.what-moved-dismissed:${projectId}:${runSeq}`;
}

export function readWhatMovedDismissed(projectId: string, runSeq: number): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.sessionStorage.getItem(whatMovedDismissKey(projectId, runSeq)) === '1';
  } catch {
    return false;
  }
}

export function writeWhatMovedDismissed(projectId: string, runSeq: number): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(whatMovedDismissKey(projectId, runSeq), '1');
  } catch {
    // private mode — dismiss stays in-component only
  }
}
