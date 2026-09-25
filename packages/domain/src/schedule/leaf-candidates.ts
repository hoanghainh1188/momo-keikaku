/**
 * Leaf-only autocomplete over WBS code and name (UX-DR6 / story 2.14).
 * Pure — safe for the Plan client bundle (must not live behind `@momo/app`'s Node fence).
 */

export interface LeafCandidate {
  readonly wpId: string;
  readonly wbsCode: string;
  readonly name: string;
}

/** Empty query → no suggestions (no spurious picks). */
export function filterLeafCandidates(
  query: string,
  candidates: readonly LeafCandidate[],
  options?: { readonly excludeWpId?: string; readonly limit?: number },
): readonly LeafCandidate[] {
  const q = query.trim().toLowerCase();
  if (q.length === 0) return [];
  const limit = options?.limit ?? 8;
  const out: LeafCandidate[] = [];
  for (const c of candidates) {
    if (options?.excludeWpId !== undefined && c.wpId === options.excludeWpId) continue;
    const hay = `${c.wbsCode} ${c.name}`.toLowerCase();
    if (!hay.includes(q)) continue;
    out.push(c);
    if (out.length >= limit) break;
  }
  return out;
}
