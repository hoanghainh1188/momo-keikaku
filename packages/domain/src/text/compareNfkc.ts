/**
 * Unicode code point order over two strings that are ALREADY NFKC-normalised.
 *
 * The single comparison both exported comparators run on, so the dotted-code one below cannot
 * drift from the one NFR-I1 names. It replaced
 * `localeCompare(a, b, undefined, { sensitivity: 'base' })` inside `compareNfkcNumeric`, which
 * reported `あ`/`ア`, `ガ`/`カ` and `A`/`a` as EQUAL — a comparator returning 0 for unequal
 * strings makes `Array.prototype.sort` unstable for those rows, so the output order depended on
 * the input order. Epic 1 retrospective, F24.
 */
function compareCodePoints(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

/**
 * NFR-I1: one NFKC-normalising comparator for product text sorts (full- vs half-width, etc.).
 * NFKC first, then Unicode code point order.
 */
export function compareNfkc(a: string, b: string): number {
  return compareCodePoints(a.normalize('NFKC'), b.normalize('NFKC'));
}

/** WBS-style codes: NFKC, then compare dot-separated segments numerically when both are digits. */
export function compareNfkcNumeric(a: string, b: string): number {
  const na = a.normalize('NFKC');
  const nb = b.normalize('NFKC');
  if (na === nb) return 0;

  const sa = na.split('.');
  const sb = nb.split('.');
  const n = Math.max(sa.length, sb.length);
  for (let i = 0; i < n; i++) {
    const pa = sa[i] ?? '';
    const pb = sb[i] ?? '';
    if (pa === pb) continue;
    const da = /^\d+$/.test(pa) ? Number(pa) : Number.NaN;
    const db = /^\d+$/.test(pb) ? Number(pb) : Number.NaN;
    if (!Number.isNaN(da) && !Number.isNaN(db)) {
      if (da < db) return -1;
      if (da > db) return 1;
      // Same integer, different spelling ("1" vs "01"): fall back to code point order so the
      // two still have a fixed relative position.
      const tie = compareCodePoints(pa, pb);
      if (tie !== 0) return tie;
      continue;
    }
    const c = compareCodePoints(pa, pb);
    if (c !== 0) return c;
  }
  return sa.length - sb.length;
}
