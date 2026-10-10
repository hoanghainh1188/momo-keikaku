import { describe, expect, it } from 'vitest';
import { workingDayIndex } from '../calendar';
import { ratio } from '../units';
import { recalculate } from './recalculate';
import { expectShuffleInvariant, seededUint32 } from '../../../../tests/support/shuffle-invariant';
import { CAL, calendar, edge, inputs, row, scheduled, wp } from '../../../../tests/support/schedule-fixtures';
// Story 2.6: the backward pass, Float and the critical path. Every date below is computed by hand.
// The Data Date is Mon 5 Oct 2026. October 2026: Mon 5 … Fri 9, Sat 10, Sun 11, Mon 12 … Fri 16,
// Mon 19 … Fri 23. The week is Mon–Fri.
function run(wps, edges = [], over = {}) {
    return scheduled(recalculate(inputs(wps, edges, over), null));
}
/** [lateStart, lateFinish, floatDays, isCritical]. */
const late = (outputs, id) => {
    const r = row(outputs, id);
    return [r.lateStart, r.lateFinish, r.floatDays, r.isCritical];
};
const position = (d) => workingDayIndex(CAL).days.indexOf(d);
describe('recalculate — the backward pass: the I/O matrix (FR-6b, AR-49)', () => {
    // A (3 d) Mon 5 – Wed 7 → B (2 d) Thu 8 – Fri 9; C (1 d) Mon 5, off the chain.
    const chain = [wp('A', { durationDays: 3 }), wp('B', { durationDays: 2 }), wp('C', { durationDays: 1 })];
    const chainEdges = [edge('A', 'B')];
    it('anchors on the computed finish when no Project finish is set', () => {
        const out = run(chain, chainEdges);
        expect(out.computedFinish).toBe('2026-10-09');
        expect(out.anchor).toEqual({ kind: 'computed_finish', date: '2026-10-09' });
        expect(late(out, 'A')).toEqual(['2026-10-05', '2026-10-07', 0, true]);
        expect(late(out, 'B')).toEqual(['2026-10-08', '2026-10-09', 0, true]);
        expect(late(out, 'C')).toEqual(['2026-10-09', '2026-10-09', 4, false]);
        expect(out.criticalPath).toEqual(['A', 'B']);
    });
    it('measures Float against a Project finish 3 working days early: the chain is critical at −3', () => {
        const out = run(chain, chainEdges, { projectFinish: '2026-10-06' });
        expect(out.anchor).toEqual({ kind: 'project_finish', date: '2026-10-06' });
        expect(out.computedFinish).toBe('2026-10-09'); // unchanged by the anchor
        // B late Mon 5 – Tue 6; A late Wed 30 Sep – Fri 2 Oct.
        expect(late(out, 'B')).toEqual(['2026-10-05', '2026-10-06', -3, true]);
        expect(late(out, 'A')).toEqual(['2026-09-30', '2026-10-02', -3, true]);
        expect(late(out, 'C')).toEqual(['2026-10-06', '2026-10-06', 1, false]);
        expect(out.criticalPath).toEqual(['A', 'B']);
    });
    it('measures Float against a Project finish 4 working days late: the minimum is 4, and it is critical', () => {
        const out = run(chain, chainEdges, { projectFinish: '2026-10-15' });
        // B late Wed 14 – Thu 15; A late Fri 9 – Tue 13.
        expect(late(out, 'B')).toEqual(['2026-10-14', '2026-10-15', 4, true]);
        expect(late(out, 'A')).toEqual(['2026-10-09', '2026-10-13', 4, true]);
        expect(late(out, 'C')).toEqual(['2026-10-15', '2026-10-15', 8, false]);
        expect(out.criticalPath).toEqual(['A', 'B']);
    });
    it('⟨Q1⟩ reverses the lag: S late-starts Thu 15, so P late-finishes Wed / Thu / Mon for lag 0 / −1 / 2', () => {
        const lateFinish = (lag) => row(run([wp('P'), wp('S')], [edge('P', 'S', lag)], { projectFinish: '2026-10-15' }), 'P').lateFinish;
        expect(lateFinish(0)).toBe('2026-10-14');
        expect(lateFinish(-1)).toBe('2026-10-15');
        expect(lateFinish(2)).toBe('2026-10-12');
    });
    it('⟨Q1⟩ dates a milestone late: M late-starts and late-finishes Mon 12, so P late-finishes Fri 9', () => {
        const out = run([wp('P', { durationDays: 2 }), wp('M', { durationDays: 0 }), wp('S', { durationDays: 1 })], [edge('P', 'M'), edge('M', 'S')], { projectFinish: '2026-10-12' });
        expect(late(out, 'S').slice(0, 2)).toEqual(['2026-10-12', '2026-10-12']);
        expect(late(out, 'M').slice(0, 2)).toEqual(['2026-10-12', '2026-10-12']);
        expect(late(out, 'P').slice(0, 2)).toEqual(['2026-10-08', '2026-10-09']);
        // M early Wed 7 (after P Mon 5 – Tue 6): Float 3, as for the chain around it.
        expect(row(out, 'M').floatDays).toBe(3);
    });
    it('⟨Q1⟩ holds a milestone predecessor back by the lag alone: M →(2) S with S late Fri 9 → M late Wed 7', () => {
        const out = run([wp('M', { durationDays: 0 }), wp('S')], [edge('M', 'S', 2)], { projectFinish: '2026-10-09' });
        expect(late(out, 'M')).toEqual(['2026-10-07', '2026-10-07', 2, true]);
    });
    it('⟨Q2⟩ gives a complete WP no late dates or Float, and lets an edge into it bound nothing', () => {
        // P (2 d) Mon 5 – Tue 6 → C, complete on Fri 2 Oct: out of sequence, but C imposes nothing, so
        // P finishes at the anchor. C → S drives S at Mon 5, tying with the Data Date.
        const out = run([
            wp('C', { durationDays: 5, actualStart: '2026-09-28', actualFinish: '2026-10-02' }),
            wp('P', { durationDays: 2 }),
            wp('S', { durationDays: 1 }),
        ], [edge('P', 'C'), edge('C', 'S')]);
        expect(late(out, 'C')).toEqual([null, null, null, false]);
        expect(out.computedFinish).toBe('2026-10-06');
        expect(late(out, 'P')).toEqual(['2026-10-05', '2026-10-06', 0, true]);
        expect(late(out, 'S')).toEqual(['2026-10-06', '2026-10-06', 1, false]);
        expect(row(out, 'S').drivingPredecessors).toEqual(['C']);
    });
    it('⟨Q2⟩ gives an in-progress WP late dates for its remaining work, Float from where it resumes', () => {
        // A started Mon 28 Sep, 4 days left: resumes Mon 5, finishes Thu 8. A → S (2 d) Fri 9 – Mon 12.
        // P → A: A is not driven by P, so P is not held back by A and finishes at the anchor.
        const out = run([
            wp('A', { durationDays: 4, actualStart: '2026-09-28' }),
            wp('P', { durationDays: 1 }),
            wp('S', { durationDays: 2 }),
        ], [edge('A', 'S'), edge('P', 'A')]);
        expect(out.computedFinish).toBe('2026-10-12');
        expect(late(out, 'S')).toEqual(['2026-10-09', '2026-10-12', 0, true]);
        // late start = late finish − 3.
        expect(late(out, 'A')).toEqual(['2026-10-05', '2026-10-08', 0, true]);
        expect(late(out, 'P')).toEqual(['2026-10-12', '2026-10-12', 5, false]);
        expect(out.criticalPath).toEqual(['A', 'S']); // A's early start is its actual start, 28 Sep
        expect(row(out, 'S').drivingPredecessors).toEqual(['A']);
        expect(row(out, 'A').drivingPredecessors).toEqual([]);
    });
    it('⟨Q2⟩ lets an in-progress WP set the computed finish', () => {
        // A started Mon 28 Sep, 6 days, no pct: resumes Mon 5, finishes Mon 12. B (2 d) Mon 5 – Tue 6.
        const out = run([wp('A', { durationDays: 6, actualStart: '2026-09-28' }), wp('B', { durationDays: 2 })]);
        expect(out.computedFinish).toBe('2026-10-12');
        expect(out.anchor).toEqual({ kind: 'computed_finish', date: '2026-10-12' });
        expect(late(out, 'A')).toEqual(['2026-10-05', '2026-10-12', 0, true]);
        expect(late(out, 'B')).toEqual(['2026-10-09', '2026-10-12', 4, false]);
        expect(out.criticalPath).toEqual(['A']);
    });
    it('⟨Q2⟩ measures an in-progress WP\'s Float from its resume point, not its actual start', () => {
        // A started Mon 28 Sep, 2 days left: Mon 5 – Tue 6. Z (5 d) Mon 5 – Fri 9 sets the finish.
        const out = run([wp('A', { durationDays: 2, actualStart: '2026-09-28' }), wp('Z', { durationDays: 5 })]);
        expect(late(out, 'A')).toEqual(['2026-10-08', '2026-10-09', 3, false]);
        expect(row(out, 'A').drivingPredecessors).toEqual([]);
    });
    it('⟨Q3⟩ bridges backwards: P →(1) X →(2) S holds P back as P →(3) S, and X gets nothing', () => {
        // P Mon 5; S driven to Fri 9. Z (6 d) Mon 5 – Mon 12 sets the finish, so S late Mon 12, X
        // accepts Mon 12 − 2 = Thu 8, and P late-finishes Thu 8 − 1 − 1 = Tue 6.
        const out = run([wp('P'), wp('S'), wp('X', { durationDays: null }), wp('Z', { durationDays: 6 })], [edge('P', 'X', 1), edge('X', 'S', 2)]);
        expect(late(out, 'S')).toEqual(['2026-10-12', '2026-10-12', 1, false]);
        expect(late(out, 'P')).toEqual(['2026-10-06', '2026-10-06', 1, false]);
        expect(late(out, 'X')).toEqual([null, null, null, false]);
        expect(row(out, 'S').drivingPredecessors).toEqual(['P']);
        expect(out.criticalPath).toEqual(['Z']);
    });
    it('⟨Q3⟩ finishes a WP whose only successor is a dead-end no-duration WP at the anchor', () => {
        const out = run([wp('P'), wp('X', { durationDays: null }), wp('Z', { durationDays: 3 })], [edge('P', 'X')]);
        expect(late(out, 'P')).toEqual(['2026-10-07', '2026-10-07', 2, false]);
    });
    it('⟨Q3⟩ takes the tightest bound across a chain of bridges and duplicate edges', () => {
        // P → X1 →(1) S1 and P →(0) X1 →(−1) X2 →(2) S2, with S1 and S2 late Fri 9 (Z sets the
        // finish). Via S1: X1 accepts Fri 9 − 1 = Thu 8. Via S2: X2 accepts Fri 9 − 2 = Wed 7, X1
        // accepts Wed 7 + 1 = Thu 8. Duplicate P → X1 with lags 0 and 1: the tighter bound is lag 1.
        // P late-finishes Thu 8 − 1 − 1 = Tue 6.
        const out = run([
            wp('P'),
            wp('S1'),
            wp('S2'),
            wp('X1', { durationDays: null }),
            wp('X2', { durationDays: null }),
            wp('Z', { durationDays: 5 }),
        ], [edge('P', 'X1'), edge('P', 'X1', 1), edge('X1', 'S1', 1), edge('X1', 'X2', -1), edge('X2', 'S2', 2)]);
        expect(row(out, 'P').lateFinish).toBe('2026-10-06');
    });
    it('⟨Q4⟩ rolls a Saturday Project finish back to Friday, and reports the Saturday', () => {
        const out = run([wp('A', { durationDays: 3 })], [], { projectFinish: '2026-10-10' });
        expect(out.anchor).toEqual({ kind: 'project_finish', date: '2026-10-10' });
        expect(late(out, 'A')).toEqual(['2026-10-07', '2026-10-09', 2, true]);
    });
    it('⟨Q5⟩ halts when a late date falls before the range, naming the WP and the side', () => {
        // The range starts Thu 1 Oct. B late Mon 5 – Tue 6; A late-finishes Fri 2 and would
        // late-start Wed 30 Sep.
        const result = recalculate(inputs([wp('A', { durationDays: 3 }), wp('B', { durationDays: 2 })], [edge('A', 'B')], {
            calendar: calendar('2026-10-01', '2027-12-31'),
            projectFinish: '2026-10-06',
        }), null);
        expect(result).toEqual({ kind: 'halted', reason: 'calendar_range', anchors: [], wps: [{ wpId: 'A', side: 'before' }] });
    });
    it('finishes no WP after the anchor, so a negative lag keeps the minimum Float at 0', () => {
        // W (5 d) Mon 5 – Fri 9 →(−3) S, driven to Wed 7. S late Fri 9 (Float 2). From S alone W
        // would late-finish Tue 13, past the computed finish; it is held at Fri 9, Float 0.
        const out = run([wp('W', { durationDays: 5 }), wp('S')], [edge('W', 'S', -3)]);
        expect(late(out, 'S')).toEqual(['2026-10-09', '2026-10-09', 2, false]);
        expect(late(out, 'W')).toEqual(['2026-10-05', '2026-10-09', 0, true]);
        expect(out.criticalPath).toEqual(['W']);
    });
    it('⟨Q5⟩ halts on a Project finish outside the range, naming the anchor and the side', () => {
        const halt = (projectFinish, cal = CAL) => recalculate(inputs([wp('A')], [], { projectFinish, calendar: cal }), null);
        expect(halt('2028-01-05')).toEqual({
            kind: 'halted',
            reason: 'calendar_range',
            anchors: [{ anchor: 'project_finish', side: 'after' }],
            wps: [],
        });
        const before = halt('2026-08-03');
        expect(before.kind === 'halted' && before.reason === 'calendar_range' && before.anchors).toEqual([
            { anchor: 'project_finish', side: 'before' },
        ]);
        // In range, but with no working day on or before it (the range opens on a weekend).
        const weekend = halt('2026-10-04', calendar('2026-10-03', '2027-12-31'));
        expect(weekend.kind === 'halted' && weekend.reason === 'calendar_range' && weekend.anchors).toEqual([
            { anchor: 'project_finish', side: 'before' },
        ]);
    });
    it('records every tied driver in compareWp order, bridged ones included', () => {
        // P1 (2 d) and P2 (2 d) end Tue 6 and drive S at Wed 7; P3 (1 d) Mon 5 →(1) X →(0) S also
        // drives Wed 7. Supplied out of order.
        const out = run([wp('S'), wp('X', { durationDays: null }), wp('P3'), wp('P2', { durationDays: 2 }), wp('P1', { durationDays: 2 })], [edge('P3', 'X', 1), edge('X', 'S'), edge('P2', 'S'), edge('P1', 'S')]);
        expect(row(out, 'S').earlyStart).toBe('2026-10-07');
        expect(row(out, 'S').drivingPredecessors).toEqual(['P1', 'P2', 'P3']);
        expect(row(out, 'P1').drivingPredecessors).toEqual([]); // the Data Date alone
    });
    it('lists only the predecessors that tie, and one entry for a source reached twice', () => {
        // P1 (1 d) Mon 5 drives Tue 6; P2 (2 d) drives Wed 7 through two edges (lags 0 and −1).
        const out = run([wp('P1'), wp('P2', { durationDays: 2 }), wp('S')], [edge('P1', 'S'), edge('P2', 'S'), edge('P2', 'S', -1)]);
        expect(row(out, 'S').drivingPredecessors).toEqual(['P2']);
    });
    it('lists no driver when the Project start alone sets the start', () => {
        // C completed Fri 2 Oct drives S at Mon 5, but the Project start is Wed 7.
        const out = run([wp('C', { durationDays: 1, actualStart: '2026-10-02', actualFinish: '2026-10-02' }), wp('S')], [edge('C', 'S')], { projectStart: '2026-10-07' });
        expect(row(out, 'S').earlyStart).toBe('2026-10-07');
        expect(row(out, 'S').drivingPredecessors).toEqual([]);
    });
    it('with nothing dated, has no computed finish, anchors on the Project finish or nothing, and no path', () => {
        const wps = [wp('A', { durationDays: null }), wp('B', { durationDays: null })];
        const bare = run(wps, [edge('A', 'B')]);
        expect(bare.computedFinish).toBeNull();
        expect(bare.anchor).toBeNull();
        expect(bare.criticalPath).toEqual([]);
        for (const w of bare.wps) {
            expect(w.floatDays).toBeNull();
            expect(w.isCritical).toBe(false);
        }
        const set = run(wps, [edge('A', 'B')], { projectFinish: '2026-10-30' });
        expect(set.anchor).toEqual({ kind: 'project_finish', date: '2026-10-30' });
        expect(set.computedFinish).toBeNull();
        expect(set.criticalPath).toEqual([]);
    });
    it('gives a summary no late dates, no Float, and never makes it critical', () => {
        const out = run([wp('1', { durationDays: null }), wp('1.1', { parentId: '1', durationDays: 2 }), wp('1.2', { parentId: '1', durationDays: 3 })], [edge('1.1', '1.2')]);
        expect(late(out, '1')).toEqual([null, null, null, false]);
        expect(row(out, '1').drivingPredecessors).toEqual([]);
        expect(out.criticalPath).toEqual(['1.1', '1.2']);
    });
    it('orders the critical path by early start, then compareWp', () => {
        // Two parallel chains of equal length: B1 (2 d) → B2 (1 d) and A1 (2 d) → A2 (1 d).
        const out = run([wp('B1', { durationDays: 2 }), wp('B2'), wp('A1', { durationDays: 2 }), wp('A2')], [edge('B1', 'B2'), edge('A1', 'A2')]);
        expect(out.criticalPath).toEqual(['A1', 'B1', 'A2', 'B2']);
    });
});
describe('recalculate — the backward pass: acceptance (story 2.6)', () => {
    /** A layered plan like the performance one, exercising every state. */
    function layered(seed, layers, width, over = {}) {
        const next = seededUint32(seed);
        const wps = [];
        const edges = [];
        for (let l = 0; l < layers; l++) {
            const summary = `${l + 1}`;
            wps.push(wp(summary, { durationDays: null }));
            for (let k = 0; k < width; k++) {
                const id = `${l + 1}.${k + 1}`;
                const roll = next() % 10;
                const spec = l === 0 && roll === 0
                    ? { actualStart: '2026-09-21', actualFinish: '2026-09-25' }
                    : l === 0 && roll === 1
                        ? { actualStart: '2026-09-28', recordedPct: ratio(1n, 3n) }
                        : roll === 2
                            ? { durationDays: null }
                            : roll === 3
                                ? { durationDays: 0 }
                                : {};
                wps.push(wp(id, { parentId: summary, durationDays: 1 + (next() % 4), plannedMh: 8000n, ...spec }));
                if (l > 0) {
                    const links = 1 + (next() % 3);
                    for (let e = 0; e < links; e++)
                        edges.push(edge(`${l}.${1 + (next() % width)}`, id, (next() % 3) - 1));
                }
            }
        }
        return inputs(wps, edges, { calendar: calendar('2026-01-01', '2028-12-31'), ...over });
    }
    it('with no Project finish, every Float is ≥ 0 and the minimum Float is 0', () => {
        for (const seed of [1, 2, 3, 4, 5]) {
            const out = scheduled(recalculate(layered(seed, 12, 8), null));
            const floats = out.wps.flatMap((w) => (w.floatDays === null ? [] : [w.floatDays]));
            expect(floats.length).toBeGreaterThan(0);
            expect(Math.min(...floats), `seed ${seed}`).toBe(0);
            expect(out.wps.filter((w) => w.isCritical).every((w) => w.floatDays === 0)).toBe(true);
        }
    });
    it('shows negative Float only when a Project finish is set', () => {
        const plan = layered(7, 12, 8);
        const relative = scheduled(recalculate(plan, null));
        expect(relative.wps.some((w) => w.floatDays !== null && w.floatDays < 0)).toBe(false);
        // Ten working days before the computed finish.
        const days = workingDayIndex(plan.calendar).days;
        const tight = days[days.indexOf(relative.computedFinish) - 10];
        const absolute = scheduled(recalculate({ ...plan, projectFinish: tight }, null));
        const min = Math.min(...absolute.wps.flatMap((w) => (w.floatDays === null ? [] : [w.floatDays])));
        expect(min).toBeLessThan(0);
        expect(absolute.criticalPath.length).toBeGreaterThan(0);
        for (const id of absolute.criticalPath)
            expect(row(absolute, id).floatDays).toBe(min);
    });
    it('moves the computed finish by N working days when a remaining critical WP grows by N', () => {
        // A (3 d) → B (2 d) → C (4 d) is the critical chain; D (2 d) is off it.
        const plan = (b) => run([wp('A', { durationDays: 3 }), wp('B', { durationDays: b }), wp('C', { durationDays: 4 }), wp('D', { durationDays: 2 })], [edge('A', 'B'), edge('B', 'C')]);
        const before = plan(2);
        expect(before.computedFinish).toBe('2026-10-15');
        expect(row(before, 'B').isCritical).toBe(true);
        for (const n of [1, 3, 6]) {
            const after = plan(2 + n);
            expect(position(after.computedFinish) - position(before.computedFinish), `N = ${n}`).toBe(n);
        }
    });
    it('lets a non-critical WP absorb growth up to its Float, and no further', () => {
        // Same plan: D (2 d) Mon 5 – Tue 6 against the computed finish Thu 15: Float 7.
        const plan = (d) => run([wp('A', { durationDays: 3 }), wp('B', { durationDays: 2 }), wp('C', { durationDays: 4 }), wp('D', { durationDays: d })], [edge('A', 'B'), edge('B', 'C')]);
        const before = plan(2);
        const float = row(before, 'D').floatDays;
        expect(float).toBe(7);
        expect(plan(2 + float).computedFinish).toBe(before.computedFinish);
        expect(position(plan(2 + float + 1).computedFinish) - position(before.computedFinish)).toBe(1);
    });
    it('moves no early date when a Project finish is set or cleared', () => {
        const plan = layered(11, 12, 8);
        const early = (out) => out.wps.map((w) => [w.wpId, w.state, w.earlyStart, w.earlyFinish, w.remainingDays, w.drivingPredecessors]);
        const without = scheduled(recalculate(plan, null));
        for (const projectFinish of ['2026-10-09', '2026-12-31', '2027-06-30']) {
            const withFinish = scheduled(recalculate({ ...plan, projectFinish }, null));
            expect(early(withFinish)).toEqual(early(without));
            expect(withFinish.computedFinish).toBe(without.computedFinish);
            expect(withFinish.outOfSequence).toEqual(without.outOfSequence);
            expect(withFinish.notSchedulable).toEqual(without.notSchedulable);
        }
    });
    it('gives identical outputs under 50 shuffles of a plan with a Project finish and negative Float', () => {
        const base = inputs([
            wp('1', { durationDays: null }),
            wp('1.1', { parentId: '1', durationDays: 3, actualStart: '2026-09-21', actualFinish: '2026-09-25' }),
            wp('1.2', { parentId: '1', durationDays: 6, actualStart: '2026-09-28', recordedPct: ratio(1n, 2n) }),
            wp('1.3', {
                parentId: '1',
                durationDays: 2,
                constraintType: 'must_finish_on',
                constraintDate: '2026-10-01',
            }),
            wp('1.4', { parentId: '1', durationDays: 2 }),
            wp('1.10', { parentId: '1', durationDays: null }),
            wp('2', { durationDays: null }),
            wp('2.1', { parentId: '2', durationDays: 0 }),
            wp('2.2', {
                parentId: '2',
                durationDays: 4,
                constraintType: 'must_start_on',
                constraintDate: '2026-10-06',
            }),
            wp('2.3', { parentId: '2', durationDays: 1 }),
            wp('3', { durationDays: 5, constraintType: 'must_start_on', constraintDate: '2026-10-12' }),
        ], [
            edge('1.1', '1.2'),
            edge('1.2', '1.3'),
            edge('1.2', '1.4'), // 1.3 and 1.4 tie on 1.2's drive
            edge('1.3', '1.10', 1),
            edge('1.10', '2.2', -1), // bridged
            edge('1.4', '2.2', 0), // ties with the bridged drive
            edge('1.3', '2.1'),
            edge('2.1', '2.3', 1),
            edge('2.2', '2.3'),
            edge('1.1', '3'),
        ], { projectFinish: '2026-10-10' });
        const items = [
            ...base.wps.map((w) => ({ kind: 'wp', wp: w })),
            ...base.edges.map((e) => ({ kind: 'edge', edge: e })),
        ];
        const fn = (list) => recalculate({
            ...base,
            wps: list.flatMap((i) => (i.kind === 'wp' ? [i.wp] : [])),
            edges: list.flatMap((i) => (i.kind === 'edge' ? [i.edge] : [])),
        }, null);
        const out = scheduled(fn(items));
        expect(out.anchor?.kind).toBe('project_finish');
        expect(out.wps.some((w) => w.floatDays !== null && w.floatDays < 0)).toBe(true);
        expect(out.criticalPath.length).toBeGreaterThan(1);
        expect(row(out, '2.2').drivingPredecessors.length).toBeGreaterThan(1);
        expect(out.violations.length).toBeGreaterThan(0);
        expectShuffleInvariant(fn, items, 50);
    });
    it('schedules a 2,500-leaf plan with a Project finish well under 300 ms', () => {
        const next = seededUint32(0x2_6);
        const wps = [];
        const edges = [];
        for (let l = 0; l < 50; l++) {
            const summary = `${l + 1}`;
            wps.push(wp(summary, { durationDays: null }));
            for (let k = 0; k < 50; k++) {
                const id = `${l + 1}.${k + 1}`;
                const roll = next() % 5;
                wps.push(roll === 0
                    ? wp(id, {
                        parentId: summary,
                        durationDays: 1 + (next() % 4),
                        plannedMh: 8000n,
                        constraintType: 'must_start_on',
                        constraintDate: '2026-10-07',
                    })
                    : roll === 1
                        ? wp(id, {
                            parentId: summary,
                            durationDays: 1 + (next() % 4),
                            plannedMh: 8000n,
                            constraintType: 'must_finish_on',
                            constraintDate: '2026-09-15',
                        })
                        : wp(id, { parentId: summary, durationDays: 1 + (next() % 4), plannedMh: 8000n }));
                if (l > 0) {
                    const links = 1 + (next() % 3);
                    for (let e = 0; e < links; e++)
                        edges.push(edge(`${l}.${1 + (next() % 50)}`, id, (next() % 3) - 1));
                }
            }
        }
        const big = inputs(wps, edges, { calendar: calendar('2026-01-01', '2028-12-31'), projectFinish: '2027-01-29' });
        scheduled(recalculate(big, null)); // warm up the JIT
        const t0 = performance.now();
        const out = scheduled(recalculate(big, null));
        const elapsed = performance.now() - t0;
        expect(out.wps).toHaveLength(2_550);
        expect(out.anchor).toEqual({ kind: 'project_finish', date: '2027-01-29' });
        expect(out.criticalPath.length).toBeGreaterThan(0);
        expect(elapsed).toBeLessThan(300);
    });
});
