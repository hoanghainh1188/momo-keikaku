/**
 * Unicode code point order. Not UTF-16 code unit order (what `a < b` gives), which differs above
 * U+FFFF: a surrogate pair's leading unit (U+D800–U+DBFF) is below U+E000–U+FFFF, so `<` puts
 * U+2000B before U+FA0E although its code point is larger.
 *
 * The single code-point comparison in the domain: `compareNfkc` runs on it, and
 * `domain/schedule/order.compareWp` (AD-28) uses it for the id tie-break.
 *
 * `compareNfkc` replaced `localeCompare(a, b, undefined, { sensitivity: 'base' })` inside the old
 * dotted-code comparator `compareNfkcNumeric` (deleted by story 2.3), which reported `あ`/`ア`,
 * `ガ`/`カ` and `A`/`a` as EQUAL — a comparator returning 0 for unequal strings makes
 * `Array.prototype.sort` unstable for those rows, so the output order depended on the input
 * order. Epic 1 retrospective, F24.
 */
export function compareCodePoints(a: string, b: string): number {
  const ia = a[Symbol.iterator]();
  const ib = b[Symbol.iterator]();
  for (;;) {
    const x = ia.next();
    const y = ib.next();
    if (x.done || y.done) {
      if (x.done && y.done) return 0;
      return x.done ? -1 : 1;
    }
    const cx = x.value.codePointAt(0)!;
    const cy = y.value.codePointAt(0)!;
    if (cx !== cy) return cx < cy ? -1 : 1;
  }
}

/**
 * NFR-I1: one NFKC-normalising comparator for product text sorts (full- vs half-width, etc.).
 * NFKC first, then Unicode code point order.
 */
export function compareNfkc(a: string, b: string): number {
  return compareCodePoints(a.normalize('NFKC'), b.normalize('NFKC'));
}
