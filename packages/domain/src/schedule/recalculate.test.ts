import { describe, expect, it } from 'vitest';
import { workingDayIndex, type IsoDate } from '../calendar';
import { ratio } from '../units';
import {
  recalculate,
  remainingDuration,
  type ScheduleEdge,
  type ScheduleInputs,
  type ScheduleOutputs,
  type ScheduleWp,
} from './recalculate';
import { validate } from './validate';
import { expectShuffleInvariant, seededUint32 } from '../../../../tests/support/shuffle-invariant';
import {
  CAL,
  PROJECT,
  calendar,
  edge,
  inputs,
  row,
  scheduled,
  wp,
} from '../../../../tests/support/schedule-fixtures';

function run(wps: ScheduleWp[], edges: ScheduleEdge[] = [], over: Partial<ScheduleInputs> = {}) {
  return scheduled(recalculate(inputs(wps, edges, over), null));
}

const dates = (outputs: ScheduleOutputs, id: string) => {
  const r = row(outputs, id);
  return [r.earlyStart, r.earlyFinish];
};

describe('recalculate — the I/O matrix (FR-6b)', () => {
  it('halts on a graph offence with the four validate lists, and no outputs', () => {
    const wps = [wp('1'), wp('2'), wp('3', { parentId: null }), wp('3.1', { parentId: '3' })];
    const edges = [edge('1', '2'), edge('2', '1'), edge('3', '3.1'), edge('1', '3')];
    const result = recalculate(inputs(wps, edges), null);
    expect(result).toEqual({
      kind: 'halted',
      reason: 'graph_invalid',
      offences: validate({ projectId: PROJECT, wps }, edges),
    });
    expect(result.kind === 'halted' && result.reason === 'graph_invalid' && result.offences.cycles).toEqual([
      ['1', '2'],
    ]);
  });

  it('halts on a cross-project edge', () => {
    const wps = [wp('1'), wp('9', { projectId: 'prj-b' })];
    const result = recalculate(inputs(wps, [edge('9', '1')]), null);
    expect(result.kind === 'halted' && result.reason).toBe('graph_invalid');
  });

  it('keeps a complete WP on its actuals, and drives its successors from the actual finish', () => {
    // A finished on Fri 2 Oct; B has lag 3, so it starts 4 working days after: Thu 8 Oct.
    const out = run(
      [wp('A', { durationDays: 5, actualStart: '2026-09-28', actualFinish: '2026-10-02' }), wp('B')],
      [edge('A', 'B', 3)],
    );
    expect(row(out, 'A')).toMatchObject({
      state: 'complete',
      earlyStart: '2026-09-28',
      earlyFinish: '2026-10-02',
      remainingDays: 0,
    });
    expect(dates(out, 'B')).toEqual(['2026-10-08', '2026-10-08']);
  });

  it('runs an in-progress WP its remaining duration from the Data Date: ceil(10 × 75/100) = 8', () => {
    const out = run([wp('A', { durationDays: 10, actualStart: '2026-09-28', recordedPct: ratio(25n, 100n) })]);
    expect(row(out, 'A')).toMatchObject({
      state: 'in_progress',
      earlyStart: '2026-09-28', // the actual start
      earlyFinish: '2026-10-14', // Mon 5 … Fri 9, Mon 12, Tue 13, Wed 14: 8 working days
      remainingDays: 8,
    });
  });

  it('resumes an in-progress WP at its actual start when that is later than the Data Date', () => {
    const out = run([wp('A', { durationDays: 2, actualStart: '2026-10-07' })]);
    expect(dates(out, 'A')).toEqual(['2026-10-07', '2026-10-08']);
  });

  it('leaves 1 working day to a WP at 100% that is not finished', () => {
    const out = run([wp('A', { durationDays: 5, actualStart: '2026-09-28', recordedPct: ratio(1n, 1n) })]);
    expect(row(out, 'A')).toMatchObject({ remainingDays: 1, earlyFinish: '2026-10-05' });
  });

  it('treats a missing pct as 0%', () => {
    const out = run([wp('A', { durationDays: 4, actualStart: '2026-09-28', recordedPct: null })]);
    expect(row(out, 'A')).toMatchObject({ remainingDays: 4, earlyFinish: '2026-10-08' });
  });

  it('runs a remaining WP with a pct but no actual start its full duration', () => {
    const out = run([wp('A', { durationDays: 4, recordedPct: ratio(1n, 2n) })]);
    expect(row(out, 'A')).toMatchObject({
      state: 'remaining',
      earlyStart: '2026-10-05',
      earlyFinish: '2026-10-08',
      remainingDays: 4,
    });
  });

  it('starts a remaining WP at the latest of the Data Date, the Project start and each drive', () => {
    // Data Date alone.
    expect(dates(run([wp('A', { durationDays: 2 })]), 'A')).toEqual(['2026-10-05', '2026-10-06']);
    // A later Project start.
    expect(dates(run([wp('A', { durationDays: 2 })], [], { projectStart: '2026-10-08' }), 'A')).toEqual([
      '2026-10-08',
      '2026-10-09',
    ]);
    // The later of two predecessor drives: P1 ends Tue 6, P2 ends Thu 8 → S starts Fri 9.
    const out = run(
      [wp('P1', { durationDays: 2 }), wp('P2', { durationDays: 4 }), wp('S', { durationDays: 1 })],
      [edge('P1', 'S'), edge('P2', 'S')],
    );
    expect(dates(out, 'S')).toEqual(['2026-10-09', '2026-10-09']);
  });

  it('keeps an actual start that precedes the drive, drives onwards from it, and flags the pair', () => {
    // P runs Mon 5 – Fri 16 (resumed from the Data Date). S started Thu 1 Oct and finished Fri 9,
    // before P's drive (Mon 19). T is driven from S's actual finish, not from P.
    const out = run(
      [
        wp('P', { durationDays: 10, actualStart: '2026-09-28' }),
        wp('S', { durationDays: 5, actualStart: '2026-10-01', actualFinish: '2026-10-09' }),
        wp('T', { durationDays: 1 }),
      ],
      [edge('P', 'S'), edge('S', 'T')],
    );
    expect(dates(out, 'S')).toEqual(['2026-10-01', '2026-10-09']);
    expect(dates(out, 'T')).toEqual(['2026-10-12', '2026-10-12']);
    expect(out.outOfSequence).toEqual([{ predecessorId: 'P', successorId: 'S' }]);
  });

  it('does not let an unfinished predecessor drive an in-progress WP, but flags the pair', () => {
    const out = run(
      [wp('P', { durationDays: 5 }), wp('S', { durationDays: 3, actualStart: '2026-10-01' })],
      [edge('P', 'S')],
    );
    expect(dates(out, 'S')).toEqual(['2026-10-01', '2026-10-07']);
    expect(out.outOfSequence).toEqual([{ predecessorId: 'P', successorId: 'S' }]);
  });

  it('flags nothing when the actual start is on or after the drive', () => {
    const out = run(
      [
        wp('P', { durationDays: 2, actualStart: '2026-09-28', actualFinish: '2026-09-29' }),
        wp('S', { durationDays: 3, actualStart: '2026-09-30' }),
      ],
      [edge('P', 'S')],
    );
    expect(out.outOfSequence).toEqual([]);
  });

  it('lists a leaf with no duration as not schedulable, with no dates, and bridges across it', () => {
    // P (finish Mon 5) →(1) X (no duration) →(2) S: S starts 4 working days after Mon: Fri 9.
    const out = run(
      [wp('P', { durationDays: 1 }), wp('S', { durationDays: 1 }), wp('X', { durationDays: null })],
      [edge('P', 'X', 1), edge('X', 'S', 2)],
    );
    expect(row(out, 'X')).toMatchObject({
      state: 'remaining',
      earlyStart: null,
      earlyFinish: null,
      remainingDays: null,
      notSchedulableReason: 'no_duration',
    });
    expect(out.notSchedulable).toEqual([{ wpId: 'X', reason: 'no_duration' }]);
    expect(dates(out, 'P')).toEqual(['2026-10-05', '2026-10-05']);
    expect(dates(out, 'S')).toEqual(['2026-10-09', '2026-10-09']);
  });

  it('bridges transitively through a chain of no-duration WPs, taking the latest drive', () => {
    // P1 ends Mon 5, P2 ends Wed 7. P1 →(3) X1 →(0) X2 →(1) S drives S from Mon 5 + 5 = Mon 12;
    // P2 →(0) X2 →(1) S drives it from Wed 7 + 2 = Fri 9. The latest wins: Mon 12.
    const out = run(
      [
        wp('P1', { durationDays: 1 }),
        wp('P2', { durationDays: 3 }),
        wp('S', { durationDays: 1 }),
        wp('X1', { durationDays: null }),
        wp('X2', { durationDays: null }),
      ],
      [edge('P1', 'X1', 3), edge('X1', 'X2'), edge('P2', 'X2'), edge('X2', 'S', 1)],
    );
    expect(dates(out, 'S')).toEqual(['2026-10-12', '2026-10-12']);
    expect(out.notSchedulable.map((n) => n.wpId)).toEqual(['X1', 'X2']);
  });

  it('flags a bridged pair against the dated predecessor', () => {
    const out = run(
      [
        wp('P', { durationDays: 5 }),
        wp('S', { durationDays: 2, actualStart: '2026-10-06' }),
        wp('X', { durationDays: null }),
      ],
      [edge('P', 'X'), edge('X', 'S')],
    );
    expect(out.outOfSequence).toEqual([{ predecessorId: 'P', successorId: 'S' }]);
  });

  it('rolls summaries up: earliest start, latest finish, summed plannedMh, never their own inputs', () => {
    const out = run(
      [
        wp('1', { durationDays: null, plannedMh: 999_000n }),
        wp('1.1', { parentId: '1', durationDays: 2, plannedMh: 8_000n }),
        wp('1.2', { parentId: '1', durationDays: null, plannedMh: 1_000n }),
        wp('1.3', { parentId: '1', durationDays: 0, plannedMh: 2_000n }),
        wp('1.3.1', { parentId: '1.3', durationDays: 3, plannedMh: 4_000n }),
        wp('2', { durationDays: 5, plannedMh: 16_000n }),
        wp('2.1', { parentId: '2', durationDays: null, plannedMh: 3_000n }),
      ],
      [edge('1.1', '1.3.1')],
    );
    expect(row(out, '1')).toEqual({
      wpId: '1',
      state: null,
      earlyStart: '2026-10-05',
      earlyFinish: '2026-10-09', // 1.3.1 runs Wed 7 – Fri 9
      remainingDays: null,
      notSchedulableReason: null,
      plannedMh: 13_000n, // 8 + 1 + 4 (1.3's own value is not read)
      lateStart: null,
      lateFinish: null,
      floatDays: null,
      isCritical: false,
      drivingPredecessors: [],
      cause: null,
    });
    expect(row(out, '1.3')).toMatchObject({ state: null, plannedMh: 4_000n, earlyStart: '2026-10-07' });
    // A summary whose descendants are all unschedulable has no dates.
    expect(row(out, '2')).toMatchObject({ earlyStart: null, earlyFinish: null, plannedMh: 3_000n });
    expect(out.notSchedulable.map((n) => n.wpId)).toEqual(['1.2', '2.1']);
  });

  it('halts when a pass would land after the range, naming the WPs in compareWp order', () => {
    // The range ends Fri 16 Oct. B runs Mon 12 – Mon 19 and C runs 11 days from Mon 5: both leave.
    // D, downstream of B, cannot be evaluated and is not named.
    const cal = calendar('2026-09-01', '2026-10-16');
    const result = recalculate(
      inputs(
        [
          wp('A', { durationDays: 5 }),
          wp('B', { durationDays: 6 }),
          wp('C', { durationDays: 11 }),
          wp('D'),
          wp('E', { durationDays: 2 }),
        ],
        [edge('A', 'B'), edge('B', 'D')],
        { calendar: cal },
      ),
      null,
    );
    expect(result).toEqual({
      kind: 'halted',
      reason: 'calendar_range',
      anchors: [],
      wps: [
        { wpId: 'B', side: 'after' },
        { wpId: 'C', side: 'after' },
      ],
    });
  });

  it('halts when an actual date needed by the pass lies before the range', () => {
    const result = recalculate(
      inputs(
        [wp('A', { actualStart: '2026-08-03', actualFinish: '2026-08-04' }), wp('B')],
        [edge('A', 'B')],
      ),
      null,
    );
    expect(result).toEqual({
      kind: 'halted',
      reason: 'calendar_range',
      anchors: [],
      wps: [{ wpId: 'A', side: 'before' }],
    });
  });

  it('halts on a Data Date outside the range, naming the anchor', () => {
    const result = recalculate(inputs([wp('A')], [], { dataDate: '2028-01-04' }), null);
    expect(result).toEqual({
      kind: 'halted',
      reason: 'calendar_range',
      anchors: [{ anchor: 'data_date', side: 'after' }],
      wps: [],
    });
    const before = recalculate(inputs([wp('A')], [], { dataDate: '2026-08-31' }), null);
    expect(before.kind === 'halted' && before.reason === 'calendar_range' && before.anchors).toEqual([
      { anchor: 'data_date', side: 'before' },
    ]);
  });

  it('halts on a Project start after the range, and ignores one before it that the Data Date passes', () => {
    const late = recalculate(inputs([wp('A')], [], { projectStart: '2028-02-01' }), null);
    expect(late.kind === 'halted' && late.reason === 'calendar_range' && late.anchors).toEqual([
      { anchor: 'project_start', side: 'after' },
    ]);
    expect(dates(run([wp('A')], [], { projectStart: '2025-04-01' }), 'A')).toEqual([
      '2026-10-05',
      '2026-10-05',
    ]);
  });

  it('starts the successor Thu / Wed / Tue for lag 0 / −1 / −2 after a Wednesday finish', () => {
    const start = (lag: number) =>
      row(run([wp('P', { durationDays: 3 }), wp('S')], [edge('P', 'S', lag)]), 'S').earlyStart;
    expect(row(run([wp('P', { durationDays: 3 })]), 'P').earlyFinish).toBe('2026-10-07'); // Wed
    expect(start(0)).toBe('2026-10-08');
    expect(start(-1)).toBe('2026-10-07');
    expect(start(-2)).toBe('2026-10-06');
  });

  it('carries a successor over the weekend: a Friday finish, lag 0, duration 2 runs Mon–Tue', () => {
    const out = run([wp('P', { durationDays: 5 }), wp('S', { durationDays: 2 })], [edge('P', 'S')]);
    expect(dates(out, 'P')).toEqual(['2026-10-05', '2026-10-09']);
    expect(dates(out, 'S')).toEqual(['2026-10-12', '2026-10-13']);
  });

  it('dates a milestone after a Friday finish on Monday, and starts its lag-0 successor on Monday', () => {
    const out = run(
      [wp('P', { durationDays: 5 }), wp('M', { durationDays: 0 }), wp('S', { durationDays: 1 })],
      [edge('P', 'M'), edge('M', 'S')],
    );
    expect(row(out, 'M')).toMatchObject({
      earlyStart: '2026-10-12',
      earlyFinish: '2026-10-12',
      remainingDays: 0,
    });
    expect(dates(out, 'S')).toEqual(['2026-10-12', '2026-10-12']);
  });

  it('starts a lag-L successor L working days after a milestone', () => {
    const out = run(
      [wp('M', { durationDays: 0 }), wp('S', { durationDays: 1 })],
      [edge('M', 'S', 2)],
    );
    expect(dates(out, 'M')).toEqual(['2026-10-05', '2026-10-05']);
    expect(dates(out, 'S')).toEqual(['2026-10-07', '2026-10-07']);
  });

  it('rolls a Data Date on a Saturday forward: remaining work starts Monday', () => {
    const out = run([wp('A', { durationDays: 1 })], [], { dataDate: '2026-10-10' });
    expect(dates(out, 'A')).toEqual(['2026-10-12', '2026-10-12']);
  });

  it('skips a listed holiday: a Wednesday finish with a Thursday holiday starts its successor Friday', () => {
    const cal = calendar('2026-09-01', '2027-12-31', ['2026-10-08']);
    const out = run([wp('P', { durationDays: 3 }), wp('S', { durationDays: 2 })], [edge('P', 'S')], {
      calendar: cal,
    });
    expect(dates(out, 'S')).toEqual(['2026-10-09', '2026-10-12']);
  });

  it('throws on bad input: a caller defect', () => {
    expect(() => run([wp('A', { recordedPct: ratio(-1n, 100n) })])).toThrow(/outside \[0, 1\]/);
    expect(() => run([wp('A', { recordedPct: ratio(101n, 100n) })])).toThrow(/outside \[0, 1\]/);
    expect(() => run([wp('A', { durationDays: -1 })])).toThrow(/duration -1/);
    expect(() => run([wp('A', { durationDays: 1.5 })])).toThrow(/duration 1.5/);
    expect(() => run([wp('A')], [edge('A', 'Z')])).toThrow(/"Z", which is not in the plan/);
    expect(() => run([wp('A'), wp('A')])).toThrow(/duplicate Work Package id "A"/);
    expect(() => run([wp('A', { actualFinish: '2026-10-01' })])).toThrow(/no actual start/);
    expect(() => run([wp('A', { actualStart: '2026-10-02', actualFinish: '2026-10-01' })])).toThrow(
      /finishes \(2026-10-01\) before it starts/,
    );
    expect(() => run([wp('A'), wp('B')], [edge('A', 'B', 0.5)])).toThrow(/lag 0.5/);
    expect(() => run([wp('A')], [], { dataDate: '2026-13-01' })).toThrow(/dataDate/);
    expect(() => run([wp('A')], [], { projectFinish: '2026-13-01' })).toThrow(/projectFinish/);
    expect(() => run([wp('A')], [], { projectFinish: 'garbage' })).toThrow(/projectFinish/);
  });

  it('accepts a pct with a negative denominator that is still in [0, 1]', () => {
    const out = run([wp('A', { durationDays: 4, actualStart: '2026-09-28', recordedPct: ratio(-1n, -2n) })]);
    expect(row(out, 'A').remainingDays).toBe(2);
  });

  it('reports foreign WPs that no edge touches as nothing: only the Project is scheduled', () => {
    const out = run([wp('A'), wp('F', { projectId: 'prj-b' })]);
    expect(out.wps.map((w) => w.wpId)).toEqual(['A']);
  });

  it('derives FR-28 causes from prevInputs without changing dates', () => {
    const current = inputs([wp('A', { durationDays: 3 })]);
    const previous = inputs([wp('A', { durationDays: 9 }), wp('B')]);
    const withPrev = scheduled(recalculate(current, previous));
    const firstRun = scheduled(recalculate(current, null));
    expect(withPrev.wps.map((r) => ({ ...r, cause: null }))).toEqual(firstRun.wps);
    expect(withPrev.wps[0]!.cause).toBe('edited');
    expect(firstRun.wps[0]!.cause).toBeNull();
  });
});

describe('recalculate — review follow-ups: branches pinned by hand', () => {
  it('schedules an in-progress WP started before the range from the Data Date', () => {
    const out = run([wp('A', { durationDays: 3, actualStart: '2026-08-03' })]);
    expect(row(out, 'A')).toMatchObject({
      state: 'in_progress',
      earlyStart: '2026-08-03',
      earlyFinish: '2026-10-07', // Mon 5 – Wed 7
      remainingDays: 3,
    });
  });

  it('flags an in-progress WP started before the range against an in-range predecessor', () => {
    const out = run(
      [wp('P', { durationDays: 2 }), wp('S', { durationDays: 3, actualStart: '2026-08-03' })],
      [edge('P', 'S')],
    );
    expect(dates(out, 'S')).toEqual(['2026-08-03', '2026-10-07']);
    expect(out.outOfSequence).toEqual([{ predecessorId: 'P', successorId: 'S' }]);
  });

  it('keeps the actual start of an in-progress WP with no duration', () => {
    const out = run(
      [wp('P', { durationDays: 1 }), wp('S'), wp('X', { durationDays: null, actualStart: '2026-10-01' })],
      [edge('P', 'X', 1), edge('X', 'S')],
    );
    expect(row(out, 'X')).toMatchObject({
      state: 'in_progress',
      earlyStart: '2026-10-01',
      earlyFinish: null,
      notSchedulableReason: 'no_duration',
    });
    // Still bridged: P ends Mon 5, so S starts 2 working days after it: Wed 7.
    expect(dates(out, 'S')).toEqual(['2026-10-07', '2026-10-07']);
  });

  it('never schedules a foreign WP, so it cannot halt the run', () => {
    const out = run([wp('A'), wp('F', { projectId: 'prj-b', actualStart: '2028-06-01' })]);
    expect(out.wps.map((w) => w.wpId)).toEqual(['A']);
  });

  it('(a) starts successors of a complete milestone on its date and 2 working days after it', () => {
    const out = run(
      [
        wp('M', { durationDays: 0, actualStart: '2026-10-07', actualFinish: '2026-10-07' }),
        wp('S1'),
        wp('S2'),
      ],
      [edge('M', 'S1'), edge('M', 'S2', 2)],
    );
    expect(dates(out, 'S1')).toEqual(['2026-10-07', '2026-10-07']); // Wed
    expect(dates(out, 'S2')).toEqual(['2026-10-09', '2026-10-09']); // Fri
  });

  it('(b) starts the lag-0 successor of a Saturday actual finish on Monday', () => {
    const out = run(
      [wp('P', { durationDays: 5, actualStart: '2026-10-01', actualFinish: '2026-10-10' }), wp('S')],
      [edge('P', 'S')],
    );
    expect(dates(out, 'S')).toEqual(['2026-10-12', '2026-10-12']);
  });

  it('(c) resumes an in-progress WP whose actual start is a Saturday on the Monday after', () => {
    const out = run([wp('A', { durationDays: 2, actualStart: '2026-10-10' })]);
    expect(dates(out, 'A')).toEqual(['2026-10-10', '2026-10-13']); // resumes Mon 12, ends Tue 13
  });

  it('(d) flags a Saturday actual start against a Monday drive, not against a Friday drive', () => {
    const flagged = (pDuration: number) =>
      run(
        [wp('P', { durationDays: pDuration }), wp('S', { durationDays: 1, actualStart: '2026-10-10' })],
        [edge('P', 'S')],
      ).outOfSequence;
    expect(flagged(5)).toEqual([{ predecessorId: 'P', successorId: 'S' }]); // P ends Fri 9: drive Mon 12
    expect(flagged(4)).toEqual([]); // P ends Thu 8: drive Fri 9
  });

  it('(e) halts on a Data Date on the range\'s last day, a weekend with no working day after it', () => {
    const result = recalculate(
      inputs([wp('A')], [], { calendar: calendar('2026-09-01', '2026-10-10'), dataDate: '2026-10-10' }),
      null,
    );
    expect(result).toEqual({
      kind: 'halted',
      reason: 'calendar_range',
      anchors: [{ anchor: 'data_date', side: 'after' }],
      wps: [],
    });
  });

  it('(f) lets the larger lag win between duplicate edges', () => {
    const out = run([wp('P'), wp('S')], [edge('P', 'S', 2), edge('P', 'S', 0)]);
    expect(dates(out, 'S')).toEqual(['2026-10-08', '2026-10-08']); // Mon 5 + 3 = Thu 8
  });

  it('(g) dates an in-progress milestone at its resume point and drives from there', () => {
    const out = run(
      [wp('M', { durationDays: 0, actualStart: '2026-09-30' }), wp('S')],
      [edge('M', 'S', 1)],
    );
    expect(row(out, 'M')).toMatchObject({
      state: 'in_progress',
      earlyStart: '2026-09-30',
      earlyFinish: '2026-10-05',
      remainingDays: 0,
    });
    expect(dates(out, 'S')).toEqual(['2026-10-06', '2026-10-06']);
  });

  it('(h) keeps a complete WP with no duration on its actuals, unlisted, driving its successors', () => {
    const out = run(
      [wp('W', { durationDays: null, actualStart: '2026-09-28', actualFinish: '2026-10-02' }), wp('S')],
      [edge('W', 'S', 2)],
    );
    expect(row(out, 'W')).toMatchObject({
      state: 'complete',
      earlyStart: '2026-09-28',
      earlyFinish: '2026-10-02',
      notSchedulableReason: null,
    });
    expect(out.notSchedulable).toEqual([]);
    expect(dates(out, 'S')).toEqual(['2026-10-07', '2026-10-07']); // Fri 2 + 3 = Wed 7
  });
});

describe('remainingDuration (AD-27)', () => {
  it('is ceil(d × (1 − pct)), at least 1, with a missing pct counting as 0', () => {
    expect(remainingDuration(10, ratio(25n, 100n))).toBe(8);
    expect(remainingDuration(10, ratio(1n, 3n))).toBe(7); // ceil(20/3)
    expect(remainingDuration(10, ratio(99n, 100n))).toBe(1); // ceil(0.1)
    expect(remainingDuration(5, ratio(1n, 1n))).toBe(1);
    expect(remainingDuration(5, null)).toBe(5);
    expect(remainingDuration(0, ratio(1n, 2n))).toBe(0); // a milestone has no work to leave
  });

  it('refuses a duration or pct it cannot mean', () => {
    expect(() => remainingDuration(-1, null)).toThrow(/duration -1/);
    expect(() => remainingDuration(2.5, null)).toThrow(/duration 2.5/);
    expect(() => remainingDuration(5, ratio(2n, 1n))).toThrow(/outside \[0, 1\]/);
    expect(() => remainingDuration(5, ratio(-1n, 4n))).toThrow(/outside \[0, 1\]/);
  });
});

describe('recalculate — a slip moves the tasks that depend on it (AC 1)', () => {
  const position = (d: IsoDate | null): number => workingDayIndex(CAL).days.indexOf(d!);

  it('moves every transitive remaining successor by N working days and leaves complete WPs alone', () => {
    // W (complete) → A → B → C, A → D →(−1) E, with a no-duration X between B and F.
    const plan = (aDuration: number) =>
      inputs(
        [
          wp('W', { durationDays: 3, actualStart: '2026-09-28', actualFinish: '2026-09-30' }),
          wp('A', { durationDays: aDuration }),
          wp('B', { durationDays: 2 }),
          wp('C', { durationDays: 4 }),
          wp('D', { durationDays: 1 }),
          wp('E', { durationDays: 3 }),
          wp('F', { durationDays: 2 }),
          wp('X', { durationDays: null }),
          wp('Z', { durationDays: 2 }), // independent: must not move
        ],
        [
          edge('W', 'A'),
          edge('A', 'B'),
          edge('B', 'C'),
          edge('A', 'D'),
          edge('D', 'E', -1),
          edge('B', 'X'),
          edge('X', 'F', 1),
        ],
      );
    for (const n of [1, 4, 7]) {
      const before = scheduled(recalculate(plan(3), null));
      const after = scheduled(recalculate(plan(3 + n), null));
      for (const id of ['B', 'C', 'D', 'E', 'F']) {
        const was = row(before, id);
        const now = row(after, id);
        expect(position(now.earlyStart) - position(was.earlyStart), `${id} start, N = ${n}`).toBe(n);
        expect(position(now.earlyFinish) - position(was.earlyFinish), `${id} finish, N = ${n}`).toBe(n);
      }
      expect(row(after, 'A').earlyStart).toBe(row(before, 'A').earlyStart);
      for (const id of ['W', 'X']) expect(row(after, id)).toEqual(row(before, id));
      // Z's forward fields stay; its Float grows by N with the computed finish (story 2.6).
      const z = row(before, 'Z');
      expect(row(after, 'Z')).toMatchObject({
        state: z.state,
        earlyStart: z.earlyStart,
        earlyFinish: z.earlyFinish,
        remainingDays: z.remainingDays,
        notSchedulableReason: z.notSchedulableReason,
        plannedMh: z.plannedMh,
        drivingPredecessors: z.drivingPredecessors,
      });
      expect(row(after, 'Z').floatDays! - z.floatDays!, `Z Float, N = ${n}`).toBe(n);
    }
  });

  it('hand-computes the chain across a weekend', () => {
    // A (3 d) Mon 5 – Wed 7; B (2 d) Thu 8 – Fri 9; C (4 d) Mon 12 – Thu 15.
    // Slip A by 2: A Mon 5 – Fri 9; B Mon 12 – Tue 13; C Wed 14 – Mon 19.
    const chain = (a: number) =>
      run(
        [wp('A', { durationDays: a }), wp('B', { durationDays: 2 }), wp('C', { durationDays: 4 })],
        [edge('A', 'B'), edge('B', 'C')],
      );
    const before = chain(3);
    expect([dates(before, 'A'), dates(before, 'B'), dates(before, 'C')]).toEqual([
      ['2026-10-05', '2026-10-07'],
      ['2026-10-08', '2026-10-09'],
      ['2026-10-12', '2026-10-15'],
    ]);
    const after = chain(5);
    expect([dates(after, 'A'), dates(after, 'B'), dates(after, 'C')]).toEqual([
      ['2026-10-05', '2026-10-09'],
      ['2026-10-12', '2026-10-13'],
      ['2026-10-14', '2026-10-19'],
    ]);
  });
});

describe('recalculate — determinism (AD-28)', () => {
  type Item = { kind: 'wp'; wp: ScheduleWp } | { kind: 'edge'; edge: ScheduleEdge };

  /** Shuffles the WP and edge lists together, as one tagged list, and splits them back. */
  const fromItems = (base: ScheduleInputs) => (items: readonly Item[]) =>
    recalculate(
      {
        ...base,
        wps: items.flatMap((i) => (i.kind === 'wp' ? [i.wp] : [])),
        edges: items.flatMap((i) => (i.kind === 'edge' ? [i.edge] : [])),
      },
      null,
    );

  it('gives identical outputs under 50 shuffles of a plan exercising every state', () => {
    const base = inputs(
      [
        wp('1', { durationDays: null }),
        wp('1.1', { parentId: '1', durationDays: 3, actualStart: '2026-09-21', actualFinish: '2026-09-25', plannedMh: 24_000n }),
        wp('1.2', { parentId: '1', durationDays: 10, actualStart: '2026-09-28', recordedPct: ratio(3n, 10n), plannedMh: 80_000n }),
        wp('1.3', {
          parentId: '1',
          durationDays: 5,
          plannedMh: 40_000n,
          constraintType: 'must_start_on',
          constraintDate: '2026-10-08',
        }),
        wp('1.10', { parentId: '1', durationDays: null, plannedMh: 1_000n }),
        wp('2', { durationDays: null }),
        wp('2.1', { parentId: '2', durationDays: 0 }),
        wp('2.2', { parentId: '2', durationDays: 4, actualStart: '2026-09-30' }),
        wp('2.3', {
          parentId: '2',
          durationDays: 2,
          plannedMh: 16_000n,
          constraintType: 'must_finish_on',
          constraintDate: '2026-10-01',
        }),
        wp('2.4', { parentId: '2', durationDays: 1 }),
        wp('3', { durationDays: 6, constraintType: 'must_start_on', constraintDate: '2026-10-12' }),
      ],
      [
        edge('1.1', '1.2'),
        edge('1.2', '1.3', 2),
        edge('1.3', '1.10', 1),
        edge('1.10', '2.3', -1),
        edge('1.3', '2.1'),
        edge('2.1', '2.2'), // out of sequence: 2.2 started before 2.1's drive
        edge('2.2', '2.4'),
        edge('2.3', '2.4', 3),
        edge('1.1', '3', -2),
      ],
      // A Project finish the plan misses, so the backward pass's outputs (negative Float, the
      // minimum-Float path) are shuffled too.
      { projectFinish: '2026-10-09' },
    );
    const items: Item[] = [
      ...base.wps.map((w): Item => ({ kind: 'wp', wp: w })),
      ...base.edges.map((e): Item => ({ kind: 'edge', edge: e })),
    ];
    const out = scheduled(fromItems(base)(items));
    expect(new Set(out.wps.map((w) => w.state))).toEqual(new Set(['complete', 'in_progress', 'remaining', null]));
    expect(out.outOfSequence.length).toBeGreaterThan(0);
    expect(out.notSchedulable).toEqual([{ wpId: '1.10', reason: 'no_duration' }]);
    expect(out.wps.some((w) => w.floatDays !== null && w.floatDays < 0)).toBe(true);
    expect(out.criticalPath.length).toBeGreaterThan(0);
    expect(out.violations.length).toBeGreaterThan(0);
    expectShuffleInvariant(fromItems(base), items, 50);
  });
});

describe('recalculate — the performance budget (NFR: full recalculation < 300 ms p95)', () => {
  it('schedules a 2,500-leaf plan well under 300 ms', () => {
    const next = seededUint32(0x2_5);
    const layers = 50;
    const width = 50;
    const wps: ScheduleWp[] = [];
    const edges: ScheduleEdge[] = [];
    for (let l = 0; l < layers; l++) {
      const summary = `${l + 1}`;
      wps.push(wp(summary, { durationDays: null }));
      for (let k = 0; k < width; k++) {
        const id = `${l + 1}.${k + 1}`;
        const roll = next() % 5;
        wps.push(
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
              : wp(id, { parentId: summary, durationDays: 1 + (next() % 4), plannedMh: 8_000n }),
        );
        if (l > 0) {
          const links = 1 + (next() % 3);
          for (let e = 0; e < links; e++) {
            edges.push(edge(`${l}.${1 + (next() % width)}`, id, (next() % 3) - 1));
          }
        }
      }
    }
    const big = inputs(wps, edges, { calendar: calendar('2026-01-01', '2028-12-31') });
    scheduled(recalculate(big, null)); // warm up the JIT
    const t0 = performance.now();
    const out = scheduled(recalculate(big, null));
    const elapsed = performance.now() - t0;
    expect(out.wps).toHaveLength(2_550);
    expect(elapsed).toBeLessThan(300);
  });
});
