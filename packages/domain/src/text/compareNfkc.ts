/**
 * NFR-I1: one NFKC-normalising comparator for product text sorts (full- vs half-width, etc.).
 * NFKC first, then Unicode code point order.
 */
export function compareNfkc(a: string, b: string): number {
  const na = a.normalize('NFKC');
  const nb = b.normalize('NFKC');
  if (na < nb) return -1;
  if (na > nb) return 1;
  return 0;
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
      const tie = pa.localeCompare(pb, undefined, { sensitivity: 'base' });
      if (tie !== 0) return tie;
      continue;
    }
    const c = pa.localeCompare(pb, undefined, { sensitivity: 'base' });
    if (c !== 0) return c;
  }
  return sa.length - sb.length;
}
