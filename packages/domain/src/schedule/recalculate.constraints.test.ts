import { describe, expect, it } from 'vitest';
import { workingDayIndex, type IsoDate } from '../calendar';
import { recalculate, type ScheduleEdge, type ScheduleInputs, type ScheduleOutputs, type ScheduleWp } from './recalculate';
import { expectShuffleInvariant, seededUint32 } from '../../../../tests/support/shuffle-invariant';
import { CAL, calendar, edge, inputs, row, scheduled, wp } from '../../../../tests/support/schedule-fixtures';

// Story 2.7: soft constraints. Every date below is computed by hand.
// The Data Date is Mon 5 Oct 2026. October 2026: Mon 5 … Fri 9, Sat 10, Sun 11, Mon 12 … Fri 16,
// Mon 19 … Fri 23. The week is Mon–Fri.

function run(wps: ScheduleWp[], edges: ScheduleEdge[] = [], over: Partial<ScheduleInputs> = {}) {
  return scheduled(recalculate(inputs(wps, edges, over), null));
}

const dates = (outputs: ScheduleOutputs, id: string) => {
  const r = row(outputs, id);
  return [r.earlyStart, r.earlyFinish];
};

const floatOf = (outputs: ScheduleOutputs, id: string) => row(outputs, id).floatDays;

const position = (d: IsoDate): number => workingDayIndex(CAL).days.indexOf(d);

describe('recalculate — soft constraints: the I/O matrix (FR-6b, AR-49)', () => {
  it('asap default: a leaf with asap and a null date is unchanged vs 2.6, with no violation', () => {
    const out = run([wp('W', { durationDays: 3 })]);
    expect(dates(out, 'W')).toEqual(['2026-10-05', '2026-10-07']);
    expect(out.violations).toEqual([]);
  });

  it('⟨Q1⟩ soft MSO holds back: graph start Mon, must_start_on Wed → early start Wed, no violation', () => {
    // W alone would start Mon 5; MSO Wed 7 holds it back. Duration 2 → finish Thu 8.
    const out = run([
      wp('W', { durationDays: 2, constraintType: 'must_start_on', constraintDate: '2026-10-07' }),
      wp('S', { durationDays: 1 }),
    ], [edge('W', 'S')]);
    expect(dates(out, 'W')).toEqual(['2026-10-07', '2026-10-08']);
    expect(dates(out, 'S')).toEqual(['2026-10-09', '2026-10-09']); // driven from the delayed finish
    expect(out.violations).toEqual([]);
    expect(row(out, 'W').drivingPredecessors).toEqual([]); // constraint alone set the start
  });

  it('⟨Q1⟩ soft MSO defeated: predecessors force Fri, must_start_on Wed → graph wins, one violation', () => {
    // P (4 d) Mon 5 – Thu 8 → W starts Fri 9; MSO Wed 7 is defeated.
    const out = run(
      [
        wp('P', { durationDays: 4 }),
        wp('W', { durationDays: 1, constraintType: 'must_start_on', constraintDate: '2026-10-07' }),
      ],
      [edge('P', 'W')],
    );
    expect(dates(out, 'W')).toEqual(['2026-10-09', '2026-10-09']);
    expect(out.violations).toEqual([
      {
        wpId: 'W',
        constraintType: 'must_start_on',
        askedDate: '2026-10-07',
        derivedDate: '2026-10-09',
        daysLate: 2, // Wed 7 → Thu 8 → Fri 9
        chain: ['P'],
      },
    ]);
  });

  it('⟨Q2⟩ MFO early OK: finishes Mon, must_finish_on Wed (later) → dates unchanged, no violation', () => {
    // W (1 d) finishes Mon 5; MFO Wed 7 is later → success, no pull.
    const out = run([
      wp('W', { durationDays: 1, constraintType: 'must_finish_on', constraintDate: '2026-10-07' }),
    ]);
    expect(dates(out, 'W')).toEqual(['2026-10-05', '2026-10-05']);
    expect(out.violations).toEqual([]);
  });

  it('⟨Q2⟩ MFO miss: finishes Fri, must_finish_on Wed (earlier) → dates unchanged, violation', () => {
    // W (5 d) Mon 5 – Fri 9; MFO Wed 7 → miss by 2 working days.
    const out = run([
      wp('W', { durationDays: 5, constraintType: 'must_finish_on', constraintDate: '2026-10-07' }),
    ]);
    expect(dates(out, 'W')).toEqual(['2026-10-05', '2026-10-09']);
    expect(out.violations).toEqual([
      {
        wpId: 'W',
        constraintType: 'must_finish_on',
        askedDate: '2026-10-07',
        derivedDate: '2026-10-09',
        daysLate: 2,
        chain: [],
      },
    ]);
  });

  it('MFO miss leaves every Float and the critical path identical to the same plan with asap', () => {
    // A→B→C (each 5 d) decides the finish at Float 0. Z off the chain has MFO six weeks early.
    const chain = [
      wp('A', { durationDays: 5 }),
      wp('B', { durationDays: 5 }),
      wp('C', { durationDays: 5 }),
      wp('Z', { durationDays: 2 }),
    ];
    const edges = [edge('A', 'B'), edge('B', 'C')];
    const asap = run(chain, edges);
    // C finishes Fri 23 Oct (A Mon5–Fri9, B Mon12–Fri16, C Mon19–Fri23). Six weeks ≈ 30 wd earlier
    // is around early Sep — use Fri 11 Sep 2026.
    const mfoDate = '2026-09-11';
    const withMfo = run(
      [...chain.slice(0, 3), wp('Z', { durationDays: 2, constraintType: 'must_finish_on', constraintDate: mfoDate })],
      edges,
    );
    expect(withMfo.violations).toHaveLength(1);
    expect(withMfo.violations[0]!).toMatchObject({
      wpId: 'Z',
      constraintType: 'must_finish_on',
      askedDate: mfoDate,
      derivedDate: dates(withMfo, 'Z')[1],
    });
    expect(withMfo.violations[0]!.daysLate).toBeGreaterThan(0);
    expect(withMfo.criticalPath).toEqual(asap.criticalPath);
    for (const id of ['A', 'B', 'C', 'Z']) {
      expect(floatOf(withMfo, id)).toBe(floatOf(asap, id));
      expect(dates(withMfo, id)).toEqual(dates(asap, id));
      expect(row(withMfo, id).isCritical).toBe(row(asap, id).isCritical);
    }
  });

  it('⟨Q3⟩ a satisfied MSO that delays W may move a dependent Z\'s Float', () => {
    // A (1 d) Mon 5 → Z (1 d) Tue 6 off a longer path would have Float. MSO on A to Wed 7
    // delays A and Z; Z's Float shrinks vs the asap plan.
    const edges = [edge('A', 'Z'), edge('L', 'M'), edge('M', 'N')];
    const asap = run(
      [wp('A'), wp('Z'), wp('L', { durationDays: 3 }), wp('M', { durationDays: 3 }), wp('N', { durationDays: 3 })],
      edges,
    );
    const held = run(
      [
        wp('A', { constraintType: 'must_start_on', constraintDate: '2026-10-07' }),
        wp('Z'),
        wp('L', { durationDays: 3 }),
        wp('M', { durationDays: 3 }),
        wp('N', { durationDays: 3 }),
      ],
      edges,
    );
    expect(held.violations).toEqual([]);
    expect(dates(held, 'A')).toEqual(['2026-10-07', '2026-10-07']);
    expect(dates(held, 'Z')).toEqual(['2026-10-08', '2026-10-08']);
    expect(floatOf(held, 'Z')).not.toBe(floatOf(asap, 'Z'));
  });

  it('a remaining milestone whose must_finish_on is missed is a violation on that milestone', () => {
    // P (3 d) Mon 5 – Wed 7 → M starts Thu 8; MFO Wed 7 is missed by 1.
    const out = run(
      [
        wp('P', { durationDays: 3 }),
        wp('M', { durationDays: 0, constraintType: 'must_finish_on', constraintDate: '2026-10-07' }),
      ],
      [edge('P', 'M')],
    );
    expect(dates(out, 'M')).toEqual(['2026-10-08', '2026-10-08']);
    expect(out.violations).toEqual([
      {
        wpId: 'M',
        constraintType: 'must_finish_on',
        askedDate: '2026-10-07',
        derivedDate: '2026-10-08',
        daysLate: 1,
        chain: ['P'],
      },
    ]);
    // Still participates in both passes as a zero-duration leaf.
    expect(row(out, 'M').floatDays).not.toBeNull();
    expect(row(out, 'M').state).toBe('remaining');
  });

  it('⟨Q4⟩ MSO on Saturday rolls forward; MFO on Saturday rolls back; asked stays the PM date', () => {
    // Sat 10 Oct → MSO rolls to Mon 12; hold-back succeeds (graph would start Mon 5).
    const mso = run([
      wp('W', { durationDays: 1, constraintType: 'must_start_on', constraintDate: '2026-10-10' }),
    ]);
    expect(dates(mso, 'W')).toEqual(['2026-10-12', '2026-10-12']);
    expect(mso.violations).toEqual([]);

    // W (5 d) finishes Fri 9; MFO Sat 10 rolls to Fri 9 → on time, no violation.
    const mfoOk = run([
      wp('W', { durationDays: 5, constraintType: 'must_finish_on', constraintDate: '2026-10-10' }),
    ]);
    expect(dates(mfoOk, 'W')).toEqual(['2026-10-05', '2026-10-09']);
    expect(mfoOk.violations).toEqual([]);

    // W (5 d) finishes Fri 9; MFO Sat 3 Oct rolls to Fri 2 → miss; asked stays Sat 3.
    const mfoMiss = run([
      wp('W', { durationDays: 5, constraintType: 'must_finish_on', constraintDate: '2026-10-03' }),
    ]);
    expect(mfoMiss.violations).toEqual([
      {
        wpId: 'W',
        constraintType: 'must_finish_on',
        askedDate: '2026-10-03',
        derivedDate: '2026-10-09',
        daysLate: position('2026-10-09') - position('2026-10-02'), // rolled asked = Fri 2
        chain: [],
      },
    ]);
  });

  it('⟨Q4⟩ a constraint date outside the calendar range halts with calendar_range naming the WP', () => {
    const tight = calendar('2026-10-01', '2026-10-31');
    const before = recalculate(
      inputs(
        [wp('W', { constraintType: 'must_start_on', constraintDate: '2026-09-15' })],
        [],
        { calendar: tight },
      ),
      null,
    );
    expect(before).toEqual({
      kind: 'halted',
      reason: 'calendar_range',
      anchors: [],
      wps: [{ wpId: 'W', side: 'before' }],
    });

    const after = recalculate(
      inputs(
        [wp('W', { constraintType: 'must_finish_on', constraintDate: '2026-11-15' })],
        [],
        { calendar: tight },
      ),
      null,
    );
    expect(after).toEqual({
      kind: 'halted',
      reason: 'calendar_range',
      anchors: [],
      wps: [{ wpId: 'W', side: 'after' }],
    });
  });

  it('⟨Q5⟩ a constraint on a complete or in-progress WP is ignored for dates and the violation list', () => {
    const complete = run([
      wp('C', {
        durationDays: 3,
        actualStart: '2026-09-28',
        actualFinish: '2026-09-30',
        constraintType: 'must_finish_on',
        constraintDate: '2026-09-01', // would miss badly if judged
      }),
    ]);
    expect(dates(complete, 'C')).toEqual(['2026-09-28', '2026-09-30']);
    expect(complete.violations).toEqual([]);

    const inProgress = run([
      wp('I', {
        durationDays: 10,
        actualStart: '2026-09-28',
        constraintType: 'must_start_on',
        constraintDate: '2026-10-12',
      }),
    ]);
    expect(row(inProgress, 'I').state).toBe('in_progress');
    expect(inProgress.violations).toEqual([]);
    // Resume is still from the Data Date / actual start, not the MSO.
    expect(dates(inProgress, 'I')[0]).toBe('2026-09-28');
  });

  it('⟨Q6⟩ days late: miss → > 0 on the list; on-time or early → no row', () => {
    const miss = run([
      wp('W', { durationDays: 5, constraintType: 'must_finish_on', constraintDate: '2026-10-07' }),
    ]);
    expect(miss.violations[0]!.daysLate).toBeGreaterThan(0);

    const onTime = run([
      wp('W', { durationDays: 5, constraintType: 'must_finish_on', constraintDate: '2026-10-09' }),
    ]);
    expect(onTime.violations).toEqual([]);

    const early = run([
      wp('W', { durationDays: 3, constraintType: 'must_finish_on', constraintDate: '2026-10-09' }),
    ]);
    expect(early.violations).toEqual([]);
  });

  it('⟨Q7⟩ the reported chain is the whole first-driver walk', () => {
    // P0 (2 d) → P1 (2 d) → W (1 d); MSO on W defeated. Chain = [P1, P0].
    const out = run(
      [
        wp('P0', { durationDays: 2 }),
        wp('P1', { durationDays: 2 }),
        wp('W', { durationDays: 1, constraintType: 'must_start_on', constraintDate: '2026-10-05' }),
      ],
      [edge('P0', 'P1'), edge('P1', 'W')],
    );
    expect(dates(out, 'W')).toEqual(['2026-10-09', '2026-10-09']);
    expect(out.violations).toEqual([
      {
        wpId: 'W',
        constraintType: 'must_start_on',
        askedDate: '2026-10-05',
        derivedDate: '2026-10-09',
        daysLate: 4,
        chain: ['P1', 'P0'],
      },
    ]);
  });

  it('violations sort by days late descending, then compareWp among ties', () => {
    // B misses by 5 (MFO Mon 5, finishes Fri 9); A misses by 3 (MFO Wed 7, finishes Fri 9);
    // C also misses by 5 — among the two at 5, compareWp puts A before C, but A is at 3, so
    // order is B (5), C (5), A (3). Wait: A id 'A' vs C 'C' — both duration 5 finish Fri 9.
    // Use distinct asked dates: B MFO Mon 5 → 4 late? Fri9−Mon5 = 4 wd.
    // positions: Mon5=?, let's use duration so days late are exact.
    // W5 finishes Fri 9: MFO Mon 5 → daysLate = pos(Fri9)-pos(Mon5) = 4
    // W3 finishes Wed 7: MFO Mon 5 → daysLate = 2
    // For two at the same days late: X and Y both miss by 2, compareWp order X then Y.
    const out = run([
      wp('Y', { durationDays: 5, constraintType: 'must_finish_on', constraintDate: '2026-10-05' }), // late 4
      wp('X', { durationDays: 5, constraintType: 'must_finish_on', constraintDate: '2026-10-05' }), // late 4
      wp('Z', { durationDays: 3, constraintType: 'must_finish_on', constraintDate: '2026-10-05' }), // late 2
    ]);
    expect(out.violations.map((v) => [v.wpId, v.daysLate])).toEqual([
      ['X', 4],
      ['Y', 4],
      ['Z', 2],
    ]);
  });

  it('an asap leaf is not on the violation list and triggers no chain walk', () => {
    const out = run([wp('A', { durationDays: 2 }), wp('B', { durationDays: 2 })], [edge('A', 'B')]);
    expect(out.violations).toEqual([]);
  });

  it('throws when must_* has a null date, or asap has a non-null date', () => {
    expect(() =>
      recalculate(
        inputs([wp('W', { constraintType: 'must_start_on', constraintDate: null })]),
        null,
      ),
    ).toThrow(/constraint/);
    expect(() =>
      recalculate(
        inputs([
          {
            ...wp('W'),
            constraintType: 'asap',
            constraintDate: '2026-10-07',
          },
        ]),
        null,
      ),
    ).toThrow(/constraint/);
  });
});

describe('recalculate — soft constraints: determinism and the performance budget', () => {
  type Item = { kind: 'wp'; wp: ScheduleWp } | { kind: 'edge'; edge: ScheduleEdge };

  it('gives identical outputs under 50 shuffles of a plan with mixed constraints', () => {
    const base = inputs(
      [
        wp('1', { durationDays: null }),
        wp('1.1', { parentId: '1', durationDays: 3, actualStart: '2026-09-21', actualFinish: '2026-09-25' }),
        wp('1.2', {
          parentId: '1',
          durationDays: 5,
          constraintType: 'must_start_on',
          constraintDate: '2026-10-08',
        }),
        wp('1.3', {
          parentId: '1',
          durationDays: 2,
          constraintType: 'must_finish_on',
          constraintDate: '2026-10-01',
        }),
        wp('1.10', { parentId: '1', durationDays: null }),
        wp('2', { durationDays: null }),
        wp('2.1', { parentId: '2', durationDays: 0, constraintType: 'must_finish_on', constraintDate: '2026-10-06' }),
        wp('2.2', { parentId: '2', durationDays: 4 }),
        wp('2.3', { parentId: '2', durationDays: 1 }),
        wp('3', { durationDays: 5, constraintType: 'must_start_on', constraintDate: '2026-10-12' }),
      ],
      [
        edge('1.1', '1.2'),
        edge('1.2', '1.3'),
        edge('1.3', '1.10', 1),
        edge('1.10', '2.2', -1),
        edge('1.3', '2.1'),
        edge('2.1', '2.3'),
        edge('2.2', '2.3'),
        edge('1.1', '3'),
      ],
      { projectFinish: '2026-10-09' },
    );
    const items: Item[] = [
      ...base.wps.map((w): Item => ({ kind: 'wp', wp: w })),
      ...base.edges.map((e): Item => ({ kind: 'edge', edge: e })),
    ];
    const fn = (list: readonly Item[]) =>
      recalculate(
        {
          ...base,
          wps: list.flatMap((i) => (i.kind === 'wp' ? [i.wp] : [])),
          edges: list.flatMap((i) => (i.kind === 'edge' ? [i.edge] : [])),
        },
        null,
      );
    const out = scheduled(fn(items));
    expect(out.violations.length).toBeGreaterThan(0);
    expect(out.criticalPath.length).toBeGreaterThan(0);
    expectShuffleInvariant(fn, items, 50);
  });

  it('schedules a 2,500-leaf plan with mixed constraints well under 300 ms', () => {
    const next = seededUint32(0x2_7);
    const wps: ScheduleWp[] = [];
    const edges: ScheduleEdge[] = [];
    for (let l = 0; l < 50; l++) {
      const summary = `${l + 1}`;
      wps.push(wp(summary, { durationDays: null }));
      for (let k = 0; k < 50; k++) {
        const id = `${l + 1}.${k + 1}`;
        const roll = next() % 5;
        const leaf =
          roll === 0
            ? wp(id, {
                parentId: summary,
                durationDays: 1 + (next() % 4),
                plannedMh: 8_000n,
                constraintType: 'must_start_on',
                constraintDate: '2026-10-07',
              })
            : roll === 1
              ? wp(id, {
                  parentId: summary,
                  durationDays: 1 + (next() % 4),
                  plannedMh: 8_000n,
                  constraintType: 'must_finish_on',
                  constraintDate: '2026-09-15',
                })
              : wp(id, { parentId: summary, durationDays: 1 + (next() % 4), plannedMh: 8_000n });
        wps.push(leaf);
        if (l > 0) {
          const links = 1 + (next() % 3);
          for (let e = 0; e < links; e++) edges.push(edge(`${l}.${1 + (next() % 50)}`, id, (next() % 3) - 1));
        }
      }
    }
    const big = inputs(wps, edges, { calendar: calendar('2026-01-01', '2028-12-31'), projectFinish: '2027-01-29' });
    scheduled(recalculate(big, null)); // warm up the JIT
    const t0 = performance.now();
    const out = scheduled(recalculate(big, null));
    const elapsed = performance.now() - t0;
    expect(out.wps).toHaveLength(2_550);
    expect(out.violations.length).toBeGreaterThan(0);
    expect(elapsed).toBeLessThan(300);
  });
});
