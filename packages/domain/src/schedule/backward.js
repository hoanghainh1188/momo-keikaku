/**
 * The backward pass, the anchor and the minimum-Float critical path (story 2.6). Internal to
 * `domain/schedule`: `recalculate` is the one entry point (AD-25), and nothing here is exported
 * from `index.ts` or named as a pass of its own.
 *
 * It mirrors the forward pass over the same plan, in reverse topological order, on working-day
 * positions (plain integers; only turning one back into a date checks the calendar's range):
 *
 *   * Only edges the forward pass used for dates constrain it. Those are edges into a remaining
 *     WP, reached directly or bridged across no-duration WPs. An edge into a complete or
 *     in-progress WP is ignored on the way back, as the forward pass ignores it on the way in
 *     (Q2 → A).
 *   * The reverse of (1 + L) (Q1 → A): a remaining successor S accepts a drive no later than its
 *     late start, so a work predecessor's late finish is min(LS(S) − L − 1) and a milestone's is
 *     min(LS(S) − L). A milestone's late start is its late finish. A WP with no dated successor
 *     finishes at the anchor, and no WP finishes after it: a lag of −2 or less (−1 or less out of
 *     a milestone) would otherwise push a predecessor past the one anchor, and a plan with no
 *     Project finish would then have no zero-Float WP (story 2.6's AC 1; see the spec's
 *     Implementation Notes).
 *   * Bridging (Q3 → A): a no-duration X accepts the tightest of its successors' bounds less the
 *     lag out, so P →(a) X →(b) S holds P back as P →(a+b) S, transitively. X itself gets no late
 *     dates and no Float, and a WP whose only successors lead nowhere dated finishes at the anchor.
 *   * An in-progress WP's late start is late finish − (remaining − 1), and its Float is measured
 *     from where it resumes. A complete WP has no late dates and no Float.
 *
 * Float = late start − early start, in working days, never clamped. `isCritical` is decided here
 * and only here: Float equals the minimum Float over the WPs that have one.
 */
import { floorPosition, workingDayAt, } from '../calendar';
import { topologicalOrder } from './plan';
/** The latest finish position over the dated WPs: the computed finish. `null` when none is dated. */
export function computedFinishPosition(nodes) {
    let latest = null;
    for (const node of nodes) {
        if (node.role === 'dated' && (latest === null || node.finish > latest))
            latest = node.finish;
    }
    return latest;
}
/**
 * A PM-set Project finish on a non-working day rolls back to the last working day on or before
 * it (Q4 → A). One outside the range, or with no working day on or before it in range, fails
 * (Q5 → A).
 */
export function projectFinishPosition(cal, projectFinish) {
    const floor = floorPosition(cal, projectFinish);
    if (!floor.ok)
        return floor;
    return floor.value < 0 ? { ok: false, side: 'before' } : floor;
}
/**
 * Late dates and Float for every dated WP, against the anchor's position. Every WP whose late
 * start or late finish leaves the calendar's range is named, with the side it left by (Q5 → A).
 */
export function backwardPass(plan, nodes, cal, anchor) {
    const n = plan.wps.length;
    /** The latest drive each WP accepts from a predecessor; `undefined` = no bound. */
    const accepts = new Array(n).fill(undefined);
    const late = new Array(n).fill(undefined);
    const leftRange = [];
    const order = topologicalOrder(plan);
    for (let k = order.length - 1; k >= 0; k--) {
        const i = order[k];
        const node = nodes[i];
        if (node.role === 'none')
            continue;
        const bound = tightestBound(plan.outgoing[i], accepts);
        if (node.role === 'bridge') {
            accepts[i] = bound;
            continue;
        }
        const isMilestone = node.days === 0;
        const fromSuccessors = bound === undefined ? anchor : isMilestone ? bound : bound - 1;
        const lateFinish = Math.min(anchor, fromSuccessors);
        const lateStart = isMilestone ? lateFinish : lateFinish - node.days + 1;
        if (node.bounds)
            accepts[i] = lateStart;
        const start = workingDayAt(cal, lateStart);
        const finish = workingDayAt(cal, lateFinish);
        if (!start.ok)
            leftRange.push({ index: i, side: start.side });
        else if (!finish.ok)
            leftRange.push({ index: i, side: finish.side });
        else
            late[i] = { lateStart: start.value, lateFinish: finish.value, floatDays: lateStart - node.start };
    }
    return leftRange.length > 0 ? { ok: false, leftRange } : { ok: true, late };
}
/** min over (successor, lag) of the successor's accepted drive less the lag; `undefined` if none. */
function tightestBound(outgoing, accepts) {
    let bound;
    for (const [s, lag] of outgoing) {
        const accepted = accepts[s];
        if (accepted === undefined)
            continue;
        const candidate = accepted - lag;
        if (bound === undefined || candidate < bound)
            bound = candidate;
    }
    return bound;
}
/**
 * The one place `isCritical` is decided (AD-26): the minimum-Float set, never the zero-Float set,
 * so a late plan's deciding chain is critical at its negative Float. `earlyStart` orders the path.
 */
export function criticalPath(late, earlyStart) {
    let minFloat = null;
    for (const l of late) {
        if (l !== undefined && (minFloat === null || l.floatDays < minFloat))
            minFloat = l.floatDays;
    }
    const isCritical = late.map((l) => l !== undefined && l.floatDays === minFloat);
    const path = [];
    isCritical.forEach((critical, i) => {
        if (critical)
            path.push(i);
    });
    const key = path.map((i) => [earlyStart(i), i]);
    key.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] - b[1]));
    return { isCritical, path: key.map(([, i]) => i) };
}
