/**
 * FR-6a's four graph rules, as invariants (AR-45, AR-46, AR-56; story 2.4).
 *
 * `validate(plan, edges)` judges a Plan — usually a PROPOSED one, the state a mutation would
 * leave — and reports every offence against each rule, separately:
 *
 *   * `cycles` — one cycle per strongly connected component that has one (Tarjan), rotated to
 *     start at the component's `compareWp`-minimum WP (AR-56). A self-link is a one-WP cycle.
 *   * `ancestorDescendant` — an edge between a WP and one of its ancestors, in either direction.
 *     A separate check from cycles: such an edge is not a cycle in the dependency graph.
 *   * `summaryEndpoints` — an edge with a summary WP at either end, naming the summary end(s).
 *   * `crossProject` — an edge with an endpoint outside `plan.projectId`.
 *
 * The four checks are independent, so one edge may appear in several lists; every
 * ancestor/descendant edge is also a summary-endpoint edge. `validate` never stops at the first
 * offence, and every list is empty when the Plan is legal.
 *
 * **Leafness comes from the plan's own parent links**: a WP that is some supplied WP's
 * `parentId` is a summary. The stored `isLeaf` / `child_count` is never read, because a
 * re-parent can make a legal edge illegal without touching the edge.
 *
 * Every list is in `compareWp` order (AD-28): `cycles` by first WP, the edge lists by
 * (predecessor, successor). The output is therefore identical under any shuffle of the input.
 *
 * An edge naming an id absent from `plan.wps` is a caller defect and throws, naming the id (an
 * import reports unknown references itself, before it builds a Plan). So does a duplicate WP id
 * (through `canonicalWps`) and a loop in the parent links.
 *
 * Callers: `app/schedule.checkPlanInvariants` (the fence's pre-write guard) and, from story 2.5,
 * `recalculate` before its passes.
 */
import { canonicalWps } from './order';
export function hasOffences(offences) {
    return (offences.cycles.length > 0 ||
        offences.ancestorDescendant.length > 0 ||
        offences.summaryEndpoints.length > 0 ||
        offences.crossProject.length > 0);
}
export function validate(plan, edges) {
    const { wps, indexOf } = canonicalWps(plan.wps);
    const byId = new Map(wps.map((wp) => [wp.id, wp]));
    assertParentLinksEndInARoot(wps, byId);
    // Edges as index pairs into the canonical list, so every later comparison is an integer one.
    const pairs = edges.map((edge) => [endpoint(indexOf, edge.predecessorId), endpoint(indexOf, edge.successorId)]);
    pairs.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const ref = ([p, s]) => ({
        predecessorId: wps[p].id,
        successorId: wps[s].id,
    });
    const summaries = new Set();
    for (const wp of wps) {
        if (wp.parentId !== null && wp.parentId !== undefined)
            summaries.add(wp.parentId);
    }
    const ancestorDescendant = [];
    const summaryEndpoints = [];
    const crossProject = [];
    for (const pair of pairs) {
        const pred = wps[pair[0]];
        const succ = wps[pair[1]];
        if (isAncestor(byId, pred, succ) || isAncestor(byId, succ, pred)) {
            ancestorDescendant.push(ref(pair));
        }
        // A self-link names its one end once.
        const ends = pred === succ ? [pred] : [pred, succ];
        const summaryIds = ends.filter((wp) => summaries.has(wp.id)).map((wp) => wp.id);
        if (summaryIds.length > 0)
            summaryEndpoints.push({ ...ref(pair), summaryIds });
        if (pred.projectId !== plan.projectId || succ.projectId !== plan.projectId) {
            crossProject.push(ref(pair));
        }
    }
    const cycles = findCycles(wps.length, pairs).map((cycle) => cycle.map((i) => wps[i].id));
    return { cycles, ancestorDescendant, summaryEndpoints, crossProject };
}
function endpoint(indexOf, id) {
    const index = indexOf.get(id);
    if (index === undefined) {
        throw new Error(`validate: an edge names Work Package "${id}", which is not in the plan`);
    }
    return index;
}
/**
 * Throws, naming a WP on it, when the parent links loop. A parent outside the plan ends a walk:
 * a foreign WP's tree need not be supplied. Checked up front so the throw does not depend on
 * which edges happen to exist.
 */
function assertParentLinksEndInARoot(wps, byId) {
    const rooted = new Set();
    for (const wp of wps) {
        const path = new Set();
        let current = wp;
        while (current !== undefined && !rooted.has(current.id)) {
            if (path.has(current.id)) {
                throw new Error(`validate: the parent links loop through Work Package "${current.id}"`);
            }
            path.add(current.id);
            current =
                current.parentId === null || current.parentId === undefined
                    ? undefined
                    : byId.get(current.parentId);
        }
        for (const id of path)
            rooted.add(id);
    }
}
/** Whether `ancestor` is a strict ancestor of `wp` through the plan's (acyclic) parent links. */
function isAncestor(byId, ancestor, wp) {
    let parentId = wp.parentId;
    while (parentId !== null && parentId !== undefined) {
        if (parentId === ancestor.id)
            return true;
        parentId = byId.get(parentId)?.parentId;
    }
    return false;
}
/**
 * One cycle per strongly connected component that has one, over canonical indices. Each is the
 * shortest cycle through the component's minimum index, found by BFS over successors in
 * ascending index (= `compareWp`) order, so it starts at the minimum by construction. The
 * result is sorted by first index.
 */
function findCycles(n, pairs) {
    const successors = Array.from({ length: n }, () => []);
    for (const [p, s] of pairs) {
        const list = successors[p];
        // `pairs` is sorted, so a duplicate edge is adjacent to its twin.
        if (list[list.length - 1] !== s)
            list.push(s);
    }
    const cycles = [];
    for (const component of stronglyConnectedComponents(successors)) {
        // A plain loop: spreading a very large component into `Math.min` can overflow the stack.
        let min = component[0];
        for (const i of component)
            if (i < min)
                min = i;
        if (component.length === 1 && !successors[min].includes(min))
            continue;
        cycles.push(shortestCycleThrough(min, new Set(component), successors));
    }
    return cycles.sort((a, b) => a[0] - b[0]);
}
function shortestCycleThrough(start, members, successors) {
    const parent = new Map([[start, -1]]);
    const queue = [start];
    for (let head = 0; head < queue.length; head++) {
        const u = queue[head];
        if (successors[u].includes(start)) {
            const path = [];
            for (let v = u; v !== -1; v = parent.get(v))
                path.push(v);
            return path.reverse();
        }
        for (const v of successors[u]) {
            if (members.has(v) && !parent.has(v)) {
                parent.set(v, u);
                queue.push(v);
            }
        }
    }
    // Unreachable: every member of a non-trivial component lies on a cycle through `start`.
    throw new Error('validate: a strongly connected component without a cycle');
}
/** Tarjan's algorithm, iterative so a long dependency chain cannot exhaust the call stack. */
function stronglyConnectedComponents(successors) {
    const n = successors.length;
    const index = new Array(n).fill(-1);
    const low = new Array(n).fill(0);
    const onStack = new Array(n).fill(false);
    const stack = [];
    const components = [];
    let counter = 0;
    for (let root = 0; root < n; root++) {
        if (index[root] !== -1)
            continue;
        // Each frame is a node and the position of the next successor to visit.
        const frames = [[root, 0]];
        index[root] = low[root] = counter++;
        stack.push(root);
        onStack[root] = true;
        while (frames.length > 0) {
            const frame = frames[frames.length - 1];
            const [v, next] = frame;
            const out = successors[v];
            if (next < out.length) {
                frame[1] = next + 1;
                const w = out[next];
                if (index[w] === -1) {
                    index[w] = low[w] = counter++;
                    stack.push(w);
                    onStack[w] = true;
                    frames.push([w, 0]);
                }
                else if (onStack[w]) {
                    low[v] = Math.min(low[v], index[w]);
                }
                continue;
            }
            frames.pop();
            if (frames.length > 0) {
                const u = frames[frames.length - 1][0];
                low[u] = Math.min(low[u], low[v]);
            }
            if (low[v] === index[v]) {
                const component = [];
                let w;
                do {
                    w = stack.pop();
                    onStack[w] = false;
                    component.push(w);
                } while (w !== v);
                components.push(component);
            }
        }
    }
    return components;
}
