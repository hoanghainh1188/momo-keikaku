/**
 * Leaf-only predecessor autocomplete (UX-DR6 / story 2.14).
 * Lives under apps/web so the client never imports `@momo/app` (Node fence) or
 * `@momo/domain` (web-to-domain-present-only). Keep in sync with
 * `packages/app/src/schedule/predecessors.ts` `filterLeafCandidates`.
 */

export interface PlanLeafCandidate {
  readonly wpId: string;
  readonly wbsCode: string;
  readonly name: string;
}

/** Empty query → no suggestions (no spurious picks). */
export function filterLeafCandidates(
  query: string,
  candidates: readonly PlanLeafCandidate[],
  options?: { readonly excludeWpId?: string; readonly limit?: number },
): readonly PlanLeafCandidate[] {
  const q = query.trim().toLowerCase();
  if (q.length === 0) return [];
  const limit = options?.limit ?? 8;
  const out: PlanLeafCandidate[] = [];
  for (const c of candidates) {
    if (options?.excludeWpId !== undefined && c.wpId === options.excludeWpId) continue;
    const hay = `${c.wbsCode} ${c.name}`.toLowerCase();
    if (!hay.includes(q)) continue;
    out.push(c);
    if (out.length >= limit) break;
  }
  return out;
}
