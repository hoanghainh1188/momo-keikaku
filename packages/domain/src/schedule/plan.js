/**
 * The plan as both passes see it (story 2.5, moved out of `recalculate.ts` in story 2.6 so that
 * file stays under the 800-line cap). Internal to `domain/schedule`: not exported from `index.ts`.
 *
 * Every reference is an integer index into the canonical (`compareWp`) WP list, and the
 * topological order breaks ties by that index, so both passes are a function of the plan alone
 * and never of the order the WPs and edges were supplied in (AD-28).
 */
import { canonicalWps } from './order';
export function buildPlan(projectId, suppliedWps, edges) {
    const { wps, indexOf } = canonicalWps(suppliedWps);
    const n = wps.length;
    const isSummary = new Array(n).fill(false);
    const children = Array.from({ length: n }, () => []);
    wps.forEach((wp, i) => {
        const parent = wp.parentId === null || wp.parentId === undefined ? undefined : indexOf.get(wp.parentId);
        if (parent !== undefined) {
            isSummary[parent] = true;
            children[parent].push(i);
        }
    });
    const incoming = Array.from({ length: n }, () => []);
    const outgoing = Array.from({ length: n }, () => []);
    const successors = Array.from({ length: n }, () => []);
    // `validate` has already refused any edge to an unknown WP.
    const pairs = edges
        .map((edge) => [indexOf.get(edge.predecessorId), indexOf.get(edge.successorId), edge.lagDays])
        .sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]);
    for (const [p, s, lag] of pairs) {
        incoming[s].push([p, lag]);
        outgoing[p].push([s, lag]);
        const out = successors[p];
        if (out[out.length - 1] !== s)
            out.push(s);
    }
    return {
        wps,
        isSummary,
        isOwn: wps.map((wp) => wp.projectId === projectId),
        incoming,
        outgoing,
        successors,
        children,
    };
}
/**
 * Kahn's algorithm with the ready set kept as a min-heap of canonical indices, so the order is
 * a function of the plan alone. `validate` has refused every cycle, so every WP is reached.
 */
export function topologicalOrder(plan) {
    const n = plan.wps.length;
    const pending = new Array(n).fill(0);
    for (let s = 0; s < n; s++) {
        // Count distinct predecessors: `successors` is de-duplicated, so indegree must match it.
        pending[s] = new Set(plan.incoming[s].map(([p]) => p)).size;
    }
    const heap = new MinHeap();
    for (let i = 0; i < n; i++)
        if (pending[i] === 0)
            heap.push(i);
    const order = [];
    while (heap.size > 0) {
        const u = heap.pop();
        order.push(u);
        for (const s of plan.successors[u]) {
            pending[s] = pending[s] - 1;
            if (pending[s] === 0)
                heap.push(s);
        }
    }
    return order;
}
class MinHeap {
    items = [];
    get size() {
        return this.items.length;
    }
    push(value) {
        const items = this.items;
        items.push(value);
        let i = items.length - 1;
        while (i > 0) {
            const parent = (i - 1) >> 1;
            if (items[parent] <= value)
                break;
            items[i] = items[parent];
            i = parent;
        }
        items[i] = value;
    }
    pop() {
        const items = this.items;
        const top = items[0];
        const last = items.pop();
        if (items.length > 0) {
            let i = 0;
            for (;;) {
                const left = 2 * i + 1;
                if (left >= items.length)
                    break;
                const right = left + 1;
                const child = right < items.length && items[right] < items[left] ? right : left;
                if (items[child] >= last)
                    break;
                items[i] = items[child];
                i = child;
            }
            items[i] = last;
        }
        return top;
    }
}
