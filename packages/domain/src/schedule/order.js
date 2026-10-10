/**
 * AD-28: one canonical order, specified to the segment — the answer to OQ-13.
 *
 * `compareWp` is the ONLY ordering site for anything the scheduler reports (the driving
 * predecessors, the critical path, the violation and out-of-sequence lists, the "not schedulable
 * yet" block, a rejected cycle), and it is total:
 *
 *   1. NFKC-normalise both WBS codes; a missing code normalises to `''`.
 *   2. Split each on `.` and compare segment by segment, in natural order — AMENDED by the
 *      founder on 2026-09-23 (decision T-A, story 2.3's Spec Change Log), because AD-28's literal
 *      step 2 was intransitive (`2` < `10` < `1a` < `2`). A segment is split into maximal runs of
 *      ASCII digits and of non-digits, compared pairwise: two digit runs as arbitrary-precision
 *      integers (`BigInt`, so nothing is lost past 2^53), two non-digit runs through
 *      `domain/text.compareNfkc` (code-point order), and a digit run before a non-digit run. When
 *      every shared run ties, fewer runs sorts first, so the empty segment sorts before
 *      everything. Equal integers spelled differently (`1` / `01`) tie and
 *      the comparison goes on. Codes made only of ASCII digits and dots order exactly as the pre-amendment rule did.
 *   3. If every shared segment ties, fewer segments sorts first (a tie-break, not a count).
 *   4. Then `wp_id`: its lowercase form, then the raw id, each by code point.
 *
 * **A code orders; it never identifies.** Nothing here keys, matches or dedupes on `wbsCode`;
 * every cross-run match is on `id`.
 *
 * `canonicalWps` is AD-26's `inputs.wps` ordering and the one site this order is applied to a
 * whole WP list: every other reference in a run is an integer index into its result.
 */
import { compareCodePoints, compareNfkc } from '../text/compareNfkc';
/** Maximal runs of ASCII digits and of non-digits. The empty segment has no runs. */
const RUNS = /[0-9]+|[^0-9]+/g;
const DIGIT_RUN = /^[0-9]/;
function compareRun(a, b) {
    const aDigits = DIGIT_RUN.test(a);
    const bDigits = DIGIT_RUN.test(b);
    if (aDigits !== bDigits)
        return aDigits ? -1 : 1;
    if (aDigits) {
        const x = BigInt(a);
        const y = BigInt(b);
        if (x === y)
            return 0;
        return x < y ? -1 : 1;
    }
    return compareNfkc(a, b);
}
/** Natural order over one (already NFKC-normalised) segment: run by run, then fewer runs first. */
function compareSegment(a, b) {
    const ra = a.match(RUNS) ?? [];
    const rb = b.match(RUNS) ?? [];
    const shared = ra.length < rb.length ? ra.length : rb.length;
    for (let i = 0; i < shared; i++) {
        const c = compareRun(ra[i], rb[i]);
        if (c !== 0)
            return c;
    }
    if (ra.length === rb.length)
        return 0;
    return ra.length < rb.length ? -1 : 1;
}
function segments(code) {
    return (code ?? '').normalize('NFKC').split('.');
}
/** AD-28's total order over Work Packages. Returns 0 only for the same `id`. */
export function compareWp(a, b) {
    const sa = segments(a.wbsCode);
    const sb = segments(b.wbsCode);
    const shared = sa.length < sb.length ? sa.length : sb.length;
    for (let i = 0; i < shared; i++) {
        const c = compareSegment(sa[i], sb[i]);
        if (c !== 0)
            return c;
    }
    if (sa.length !== sb.length)
        return sa.length < sb.length ? -1 : 1;
    const byLowerId = compareCodePoints(a.id.toLowerCase(), b.id.toLowerCase());
    if (byLowerId !== 0)
        return byLowerId;
    // AD-28 step 4's last clause: reached only by two ids that differ in case alone (never two
    // canonical UUIDs), so distinct ids still never compare equal.
    return compareCodePoints(a.id, b.id);
}
/**
 * AD-26's `inputs.wps` ordering: the WP list in `compareWp` order, plus the index every other
 * reference in a run is written as. Throws on a duplicate `id`, naming it.
 */
export function canonicalWps(wps) {
    const seen = new Set();
    for (const wp of wps) {
        if (seen.has(wp.id)) {
            throw new Error(`canonicalWps: duplicate Work Package id "${wp.id}"`);
        }
        seen.add(wp.id);
    }
    const sorted = [...wps].sort(compareWp);
    const indexOf = new Map(sorted.map((wp, index) => [wp.id, index]));
    return { wps: sorted, indexOf };
}
