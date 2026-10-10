import { describe, expect, it } from 'vitest';
import { hasOffences, validate } from './validate';
import { expectShuffleInvariant, seededShuffle } from '../../../../tests/support/shuffle-invariant';
const PROJECT = 'prj-a';
/** A WP whose id doubles as its WBS code, so `compareWp` order is the natural order of the ids. */
const wp = (id, parentId = null, projectId = PROJECT) => ({
    id,
    wbsCode: id,
    parentId,
    projectId,
});
const edge = (predecessorId, successorId) => ({
    predecessorId,
    successorId,
});
const plan = (...wps) => ({ projectId: PROJECT, wps });
const EMPTY = { cycles: [], ancestorDescendant: [], summaryEndpoints: [], crossProject: [] };
describe('validate — the I/O matrix (FR-6a, AR-46)', () => {
    it('reports four empty lists for a legal leaf chain', () => {
        const result = validate(plan(wp('1'), wp('2'), wp('3')), [edge('1', '2'), edge('2', '3')]);
        expect(result).toEqual(EMPTY);
        expect(hasOffences(result)).toBe(false);
    });
    it('reports a cycle rotated to its compareWp minimum', () => {
        const result = validate(plan(wp('1'), wp('2'), wp('3')), [
            edge('3', '1'),
            edge('1', '2'),
            edge('2', '3'),
        ]);
        expect(result).toEqual({ ...EMPTY, cycles: [['1', '2', '3']] });
        expect(hasOffences(result)).toBe(true);
    });
    it('reports a self-link as a one-WP cycle', () => {
        expect(validate(plan(wp('1')), [edge('1', '1')])).toEqual({ ...EMPTY, cycles: [['1']] });
    });
    it('reports one cycle per strongly connected component: the shortest through its minimum', () => {
        const result = validate(plan(wp('1'), wp('2'), wp('3')), [
            edge('1', '2'),
            edge('2', '1'),
            edge('2', '3'),
            edge('3', '2'),
        ]);
        expect(result.cycles).toEqual([['1', '2']]);
    });
    it('reports the shortest cycle through the minimum, not the first one found', () => {
        // 1→2→3→4→1 and 1→5→1: the component is one, the shortest cycle through 1 is [1, 5].
        const result = validate(plan(wp('1'), wp('2'), wp('3'), wp('4'), wp('5')), [
            edge('1', '2'),
            edge('2', '3'),
            edge('3', '4'),
            edge('4', '1'),
            edge('1', '5'),
            edge('5', '1'),
        ]);
        expect(result.cycles).toEqual([['1', '5']]);
    });
    it('reports an ancestor/descendant edge there and as a summary endpoint, but not as a cycle', () => {
        // S is a summary; L is its grandchild through M.
        const result = validate(plan(wp('S'), wp('S.M', 'S'), wp('S.M.L', 'S.M')), [edge('S', 'S.M.L')]);
        expect(result).toEqual({
            ...EMPTY,
            ancestorDescendant: [edge('S', 'S.M.L')],
            summaryEndpoints: [{ ...edge('S', 'S.M.L'), summaryIds: ['S'] }],
        });
    });
    it('reports an ancestor/descendant edge in the descendant-to-ancestor direction too', () => {
        const result = validate(plan(wp('S'), wp('S.L', 'S')), [edge('S.L', 'S')]);
        expect(result.ancestorDescendant).toEqual([edge('S.L', 'S')]);
        expect(result.summaryEndpoints).toEqual([{ ...edge('S.L', 'S'), summaryIds: ['S'] }]);
    });
    it('catches a re-parent that made a legal edge illegal, with no edge touched', () => {
        const edges = [edge('A', 'B')];
        expect(validate(plan(wp('A'), wp('B')), edges)).toEqual(EMPTY);
        // B moves under A: A becomes a summary, and the edge now links an ancestor to its child.
        const moved = validate(plan(wp('A'), wp('B', 'A')), edges);
        expect(moved.ancestorDescendant).toEqual([edge('A', 'B')]);
        expect(moved.summaryEndpoints).toEqual([{ ...edge('A', 'B'), summaryIds: ['A'] }]);
    });
    it('judges leafness from the plan\'s parent links alone', () => {
        // 2 has a child, so it is a summary whatever a stored flag says.
        const result = validate(plan(wp('1'), wp('2'), wp('2.1', '2')), [edge('1', '2')]);
        expect(result).toEqual({
            ...EMPTY,
            summaryEndpoints: [{ ...edge('1', '2'), summaryIds: ['2'] }],
        });
    });
    it('names both ends when both are summaries, predecessor first', () => {
        const result = validate(plan(wp('1'), wp('1.1', '1'), wp('2'), wp('2.1', '2')), [edge('2', '1')]);
        expect(result.summaryEndpoints).toEqual([{ ...edge('2', '1'), summaryIds: ['2', '1'] }]);
    });
    it('names a summary end once on a self-link', () => {
        const result = validate(plan(wp('S'), wp('S.1', 'S')), [edge('S', 'S')]);
        expect(result).toEqual({
            ...EMPTY,
            cycles: [['S']],
            summaryEndpoints: [{ ...edge('S', 'S'), summaryIds: ['S'] }],
        });
    });
    it('reports a duplicate edge once per copy in the edge lists and once in cycles', () => {
        const result = validate(plan(wp('S'), wp('S.1', 'S')), [
            edge('S.1', 'S'),
            edge('S', 'S.1'),
            edge('S.1', 'S'),
        ]);
        expect(result).toEqual({
            ...EMPTY,
            cycles: [['S', 'S.1']],
            ancestorDescendant: [edge('S', 'S.1'), edge('S.1', 'S'), edge('S.1', 'S')],
            summaryEndpoints: [
                { ...edge('S', 'S.1'), summaryIds: ['S'] },
                { ...edge('S.1', 'S'), summaryIds: ['S'] },
                { ...edge('S.1', 'S'), summaryIds: ['S'] },
            ],
        });
    });
    it('counts each non-cycle offence alone as an offence', () => {
        const summaryOnly = validate(plan(wp('1'), wp('2'), wp('2.1', '2')), [edge('1', '2')]);
        expect(summaryOnly.cycles).toEqual([]);
        expect(summaryOnly.ancestorDescendant).toEqual([]);
        expect(hasOffences(summaryOnly)).toBe(true);
        const crossOnly = validate(plan(wp('1'), wp('2', null, 'prj-b')), [edge('1', '2')]);
        expect(crossOnly).toEqual({ ...EMPTY, crossProject: [edge('1', '2')] });
        expect(hasOffences(crossOnly)).toBe(true);
        // Every ancestor/descendant edge also has a summary end, so this offence cannot occur alone
        // in `validate`'s output; judge `hasOffences` on a hand-built result instead.
        const ancestorOnly = { ...EMPTY, ancestorDescendant: [edge('1', '1.1')] };
        expect(hasOffences(ancestorOnly)).toBe(true);
    });
    it('reports an edge with an endpoint in another Project', () => {
        const result = validate(plan(wp('1'), wp('2', null, 'prj-b')), [edge('1', '2'), edge('2', '1')]);
        expect(result).toEqual({
            ...EMPTY,
            cycles: [['1', '2']],
            crossProject: [edge('1', '2'), edge('2', '1')],
        });
    });
    it('stops the ancestor walk at a parent outside the plan', () => {
        const result = validate(plan(wp('1', 'elsewhere'), wp('2')), [edge('1', '2')]);
        expect(result.ancestorDescendant).toEqual([]);
    });
    it('throws on an edge naming a Work Package absent from the plan, naming it', () => {
        expect(() => validate(plan(wp('1')), [edge('1', 'ghost')])).toThrow(/"ghost"/);
        expect(() => validate(plan(wp('1')), [edge('ghost', '1')])).toThrow(/"ghost"/);
    });
    it('throws on a loop in the parent links, naming it', () => {
        // Thrown whether or not an edge would have walked into the loop.
        expect(() => validate(plan(wp('1', '2'), wp('2', '1')), [edge('1', '2')])).toThrow(/parent links loop/);
        expect(() => validate(plan(wp('1', '2'), wp('2', '1'), wp('3')), [])).toThrow(/parent links loop/);
        expect(() => validate(plan(wp('1', '1')), [])).toThrow(/"1"/);
    });
    it('throws on a duplicate Work Package id', () => {
        expect(() => validate(plan(wp('1'), wp('1')), [])).toThrow(/duplicate/);
    });
});
/**
 * One plan carrying every offence:
 *   * cycles: 3.1 → 3.2 → 3.1, and a self-link on 4;
 *   * ancestor/descendant: 1 → 1.2 (1 is 1.2's parent), and 2.1.1 → 2 (2 is its grandparent);
 *   * summary endpoints: the two above, plus 5 → 2.1 (2.1 is a summary);
 *   * cross-project: 5 → X (X is another Project's WP), and X → 3.1.
 */
const ALL_FOUR_WPS = [
    wp('1'),
    wp('1.1', '1'),
    wp('1.2', '1'),
    wp('2'),
    wp('2.1', '2'),
    wp('2.1.1', '2.1'),
    wp('3'),
    wp('3.1', '3'),
    wp('3.2', '3'),
    wp('4'),
    wp('5'),
    wp('X', null, 'prj-b'),
];
const ALL_FOUR_EDGES = [
    edge('3.2', '3.1'),
    edge('4', '4'),
    edge('X', '3.1'),
    edge('2.1.1', '2'),
    edge('5', 'X'),
    edge('1', '1.2'),
    edge('3.1', '3.2'),
    edge('5', '2.1'),
    edge('1.1', '5'),
];
const ALL_FOUR_EXPECTED = {
    cycles: [['3.1', '3.2'], ['4']],
    ancestorDescendant: [edge('1', '1.2'), edge('2.1.1', '2')],
    summaryEndpoints: [
        { ...edge('1', '1.2'), summaryIds: ['1'] },
        { ...edge('2.1.1', '2'), summaryIds: ['2'] },
        { ...edge('5', '2.1'), summaryIds: ['2.1'] },
    ],
    crossProject: [edge('5', 'X'), edge('X', '3.1')],
};
describe('validate — one plan with all four offences', () => {
    it('reports all four, each list pinned in compareWp order', () => {
        expect(validate({ projectId: PROJECT, wps: ALL_FOUR_WPS }, ALL_FOUR_EDGES)).toEqual(ALL_FOUR_EXPECTED);
    });
    it('is identical under shuffled WPs (AD-28)', () => {
        expectShuffleInvariant((wps) => validate({ projectId: PROJECT, wps }, ALL_FOUR_EDGES), ALL_FOUR_WPS, 50);
    });
    it('is identical under shuffled edges (AD-28)', () => {
        expectShuffleInvariant((edges) => validate({ projectId: PROJECT, wps: ALL_FOUR_WPS }, edges), ALL_FOUR_EDGES, 50);
    });
    it('is identical under both shuffled at once', () => {
        for (let seed = 0; seed < 50; seed++) {
            const result = validate({ projectId: PROJECT, wps: seededShuffle(ALL_FOUR_WPS, seed) }, seededShuffle(ALL_FOUR_EDGES, seed + 1000));
            expect(result, `seed ${seed}`).toEqual(ALL_FOUR_EXPECTED);
        }
    });
});
describe('validate — cycle rotation (AR-56)', () => {
    const wps = [wp('1'), wp('2'), wp('3'), wp('4')];
    const ring = ['1', '2', '3', '4'];
    it('reports the same cycle whichever WP the edges are given from', () => {
        for (let start = 0; start < ring.length; start++) {
            const rotated = [...ring.slice(start), ...ring.slice(0, start)];
            const edges = rotated.map((id, i) => edge(id, rotated[(i + 1) % rotated.length]));
            expect(validate(plan(...wps), edges).cycles, `starting at ${rotated[0]}`).toEqual([ring]);
        }
    });
    it('rotates by compareWp, not by id or input order: 10 sorts after 9', () => {
        const result = validate(plan(wp('10'), wp('9')), [edge('10', '9'), edge('9', '10')]);
        expect(result.cycles).toEqual([['9', '10']]);
    });
    it('sorts separate cycles by their first WP', () => {
        const result = validate(plan(wp('1'), wp('2'), wp('3'), wp('4')), [
            edge('4', '3'),
            edge('3', '4'),
            edge('2', '1'),
            edge('1', '2'),
        ]);
        expect(result.cycles).toEqual([
            ['1', '2'],
            ['3', '4'],
        ]);
    });
    it('handles a long chain without exhausting the stack', () => {
        const ids = Array.from({ length: 20_000 }, (_, i) => String(i + 1));
        const edges = ids.slice(1).map((id, i) => edge(ids[i], id));
        const result = validate(plan(...ids.map((id) => wp(id))), [...edges, edge(ids[ids.length - 1], '1')]);
        expect(result.cycles).toHaveLength(1);
        expect(result.cycles[0]).toEqual(ids);
    });
});
