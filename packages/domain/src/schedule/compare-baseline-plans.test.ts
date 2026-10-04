import { describe, expect, it } from 'vitest';
import { encode } from '../present/codec';
import { CAL, CAL_JP, edge, inputs, wp } from './corpus/fixtures';
import { recalculate } from './recalculate';
import {
  compareBaselinePlans,
  type PinnedBaselinePlan,
} from './compare-baseline-plans';
import { publishedSnapshotBaselinePin } from './published-snapshot-pin';
import {
  encodeScheduleInputs,
  encodeScheduleOutputs,
  parseStoredInputs,
  parseStoredOutputs,
} from './stored-run';

function pinFrom(
  scheduleInputs: ReturnType<typeof inputs>,
  options: { calendarVersionSeq?: number; milestoneIds?: ReadonlySet<string> } = {},
): PinnedBaselinePlan {
  const result = recalculate(scheduleInputs, null);
  expect(result.kind).toBe('scheduled');
  if (result.kind !== 'scheduled') throw new Error('expected scheduled');
  const causes = new Map(result.outputs.wps.map((r) => [r.wpId, r.cause] as const));
  const storedIn = encodeScheduleInputs(scheduleInputs, causes, {
    calendarVersionSeq: options.calendarVersionSeq ?? 1,
    milestoneIds: options.milestoneIds,
  });
  const storedOut = encodeScheduleOutputs(
    result.outputs,
    storedIn.wps.map((w) => w.id),
  );
  // Round-trip through parse so tests exercise the same path as app/fence.
  return {
    inputs: parseStoredInputs(encode(storedIn)),
    outputs: parseStoredOutputs(encode(storedOut)),
  };
}

describe('compareBaselinePlans (story 4.4)', () => {
  it('happy: removed edge appears in project list and accounts for successor date move', () => {
    const withEdge = pinFrom(
      inputs([wp('A', { durationDays: 5 }), wp('B', { durationDays: 3 })], [edge('A', 'B')], {
        calendar: CAL_JP,
      }),
    );
    const withoutEdge = pinFrom(
      inputs([wp('A', { durationDays: 5 }), wp('B', { durationDays: 3 })], [], {
        calendar: CAL_JP,
      }),
    );

    const diff = compareBaselinePlans(withEdge, withoutEdge);
    expect(diff.projectChanges).toContainEqual({
      kind: 'edge_removed',
      edge: { predecessorWpId: 'A', successorWpId: 'B', type: 'FS' },
    });

    const b = diff.wpDateDeltas.find((d) => d.wpId === 'B');
    expect(b).toBeDefined();
    expect(b!.unattributed).toBe(false);
    expect(b!.accountedBy.some((c) => c.kind === 'edge_removed')).toBe(true);
    expect(b!.fromEarlyStart).not.toBe(b!.toEarlyStart);
  });

  it('lag change is a first-class project list entry and attributes the successor', () => {
    const lag0 = pinFrom(
      inputs([wp('A', { durationDays: 5 }), wp('B', { durationDays: 3 })], [edge('A', 'B', 0)], {
        calendar: CAL_JP,
      }),
    );
    const lag2 = pinFrom(
      inputs([wp('A', { durationDays: 5 }), wp('B', { durationDays: 3 })], [edge('A', 'B', 2)], {
        calendar: CAL_JP,
      }),
    );

    const diff = compareBaselinePlans(lag0, lag2);
    expect(diff.projectChanges).toContainEqual({
      kind: 'edge_lag_changed',
      edge: { predecessorWpId: 'A', successorWpId: 'B', type: 'FS' },
      fromLagDays: 0,
      toLagDays: 2,
    });
    const b = diff.wpDateDeltas.find((d) => d.wpId === 'B');
    expect(b?.accountedBy.some((c) => c.kind === 'edge_lag_changed')).toBe(true);
    expect(b?.unattributed).toBe(false);
  });

  it('duration change attributes the WP whose dates moved', () => {
    const d5 = pinFrom(inputs([wp('A', { durationDays: 5 })], [], { calendar: CAL_JP }));
    const d7 = pinFrom(inputs([wp('A', { durationDays: 7 })], [], { calendar: CAL_JP }));
    const diff = compareBaselinePlans(d5, d7);
    expect(diff.projectChanges).toContainEqual({
      kind: 'duration_changed',
      wpId: 'A',
      fromDays: 5,
      toDays: 7,
    });
    expect(diff.wpDateDeltas).toHaveLength(1);
    expect(diff.wpDateDeltas[0]!.wpId).toBe('A');
    expect(diff.wpDateDeltas[0]!.unattributed).toBe(false);
    expect(diff.wpDateDeltas[0]!.accountedBy.some((c) => c.kind === 'duration_changed')).toBe(
      true,
    );
  });

  it('constraint change appears in project list and attributes the WP', () => {
    const asap = pinFrom(
      inputs(
        [wp('A', { durationDays: 3, constraintType: 'asap', constraintDate: null })],
        [],
        { calendar: CAL_JP },
      ),
    );
    const mfo = pinFrom(
      inputs(
        [
          wp('A', {
            durationDays: 3,
            constraintType: 'must_finish_on',
            constraintDate: '2026-10-20',
          }),
        ],
        [],
        { calendar: CAL_JP, projectFinish: '2026-11-30' },
      ),
    );
    const diff = compareBaselinePlans(asap, mfo);
    expect(diff.projectChanges.some((c) => c.kind === 'constraint_changed')).toBe(true);
    const a = diff.wpDateDeltas.find((d) => d.wpId === 'A');
    // Constraint may or may not move early dates depending on MFO vs derived; if dates
    // moved, attribution must name the constraint (and/or project_finish).
    if (a !== undefined) {
      expect(a.unattributed).toBe(false);
      expect(
        a.accountedBy.some(
          (c) => c.kind === 'constraint_changed' || c.kind === 'project_finish_changed',
        ),
      ).toBe(true);
    }
  });

  it('calendar version + data date / project start appear as project-level changes', () => {
    const a = pinFrom(
      inputs([wp('A', { durationDays: 3 })], [], {
        calendar: CAL,
        projectStart: '2026-09-01',
        dataDate: '2026-10-05',
      }),
      { calendarVersionSeq: 1 },
    );
    const b = pinFrom(
      inputs([wp('A', { durationDays: 3 })], [], {
        calendar: CAL_JP,
        projectStart: '2026-09-08',
        dataDate: '2026-10-12',
      }),
      { calendarVersionSeq: 2 },
    );
    const diff = compareBaselinePlans(a, b);
    expect(diff.projectChanges).toEqual(
      expect.arrayContaining([
        {
          kind: 'calendar_version_changed',
          fromVersionSeq: 1,
          toVersionSeq: 2,
        },
        { kind: 'project_start_changed', from: '2026-09-01', to: '2026-09-08' },
        { kind: 'data_date_changed', from: '2026-10-05', to: '2026-10-12' },
      ]),
    );
    for (const row of diff.wpDateDeltas) {
      expect(row.unattributed).toBe(false);
    }
  });

  it('matches WPs by wp_id; wbs_code sorts only (AR-55)', () => {
    const first = pinFrom(
      inputs(
        [
          { ...wp('wp-x', { durationDays: 2 }), wbsCode: '1.1' },
          { ...wp('wp-y', { durationDays: 2 }), wbsCode: '1.2' },
        ],
        [edge('wp-x', 'wp-y')],
        { calendar: CAL_JP },
      ),
    );
    // Same ids, renumbered WBS (re-parent), plus duration bump so dates move.
    const second = pinFrom(
      inputs(
        [
          { ...wp('wp-x', { durationDays: 4 }), wbsCode: '2.9' },
          { ...wp('wp-y', { durationDays: 2 }), wbsCode: '2.1' },
        ],
        [edge('wp-x', 'wp-y')],
        { calendar: CAL_JP },
      ),
    );
    const diff = compareBaselinePlans(first, second);
    const x = diff.wpDateDeltas.find((d) => d.wpId === 'wp-x');
    expect(x).toBeDefined();
    expect(x!.wbsCode).toBe('2.9');
    // Sort by wbs_code then id: 2.1 before 2.9.
    if (diff.wpDateDeltas.length >= 2) {
      const codes = diff.wpDateDeltas.map((d) => d.wbsCode);
      expect(codes).toEqual([...codes].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)));
    }
    // Must not invent a match key from wbs alone — wp-x stays wp-x.
    expect(diff.wpDateDeltas.every((d) => d.wpId === 'wp-x' || d.wpId === 'wp-y')).toBe(true);
  });

  it('identical plans yield empty project lists and no date rows', () => {
    const plan = pinFrom(
      inputs([wp('A', { durationDays: 5 }), wp('B', { durationDays: 3 })], [edge('A', 'B')], {
        calendar: CAL_JP,
      }),
    );
    const diff = compareBaselinePlans(plan, plan);
    expect(diff.projectChanges).toEqual([]);
    expect(diff.wpDateDeltas).toEqual([]);
  });

  it('milestone / actual / percent changes are listed', () => {
    const base = pinFrom(
      inputs(
        [
          wp('A', {
            durationDays: 5,
            actualStart: null,
            actualFinish: null,
            recordedPct: null,
          }),
        ],
        [],
        { calendar: CAL_JP },
      ),
      { milestoneIds: new Set() },
    );
    const next = pinFrom(
      inputs(
        [
          wp('A', {
            durationDays: 5,
            actualStart: '2026-10-05',
            actualFinish: null,
            recordedPct: { num: 1n, den: 2n },
          }),
        ],
        [],
        { calendar: CAL_JP },
      ),
      { milestoneIds: new Set(['A']) },
    );
    const diff = compareBaselinePlans(base, next);
    expect(diff.projectChanges.some((c) => c.kind === 'actual_dates_changed')).toBe(true);
    expect(diff.projectChanges.some((c) => c.kind === 'recorded_pct_changed')).toBe(true);
    expect(diff.projectChanges.some((c) => c.kind === 'milestone_changed')).toBe(true);
  });

  it('transitive predecessor duration change attributes the successor', () => {
    const chain = pinFrom(
      inputs(
        [wp('A', { durationDays: 2 }), wp('B', { durationDays: 2 }), wp('C', { durationDays: 2 })],
        [edge('A', 'B'), edge('B', 'C')],
        { calendar: CAL_JP },
      ),
    );
    const longerA = pinFrom(
      inputs(
        [wp('A', { durationDays: 6 }), wp('B', { durationDays: 2 }), wp('C', { durationDays: 2 })],
        [edge('A', 'B'), edge('B', 'C')],
        { calendar: CAL_JP },
      ),
    );
    const diff = compareBaselinePlans(chain, longerA);
    const c = diff.wpDateDeltas.find((d) => d.wpId === 'C');
    expect(c).toBeDefined();
    expect(c!.unattributed).toBe(false);
    expect(
      c!.accountedBy.some((ch) => ch.kind === 'duration_changed' && ch.wpId === 'A'),
    ).toBe(true);
  });

  it('marks unattributed when early dates differ with no accounting input change', () => {
    const plan = pinFrom(
      inputs([wp('A', { durationDays: 5 })], [], { calendar: CAL_JP }),
    );
    // Same inputs; only stored early dates drift — FR-16 failure signal.
    const drifted: PinnedBaselinePlan = {
      inputs: plan.inputs,
      outputs: {
        ...plan.outputs,
        wps: plan.outputs.wps.map((row, i) =>
          i === 0
            ? { ...row, earlyStart: '2099-01-01', earlyFinish: '2099-01-02' }
            : row,
        ),
      },
    };
    const diff = compareBaselinePlans(plan, drifted);
    expect(diff.projectChanges).toEqual([]);
    const a = diff.wpDateDeltas.find((d) => d.wpId === 'A');
    expect(a).toBeDefined();
    expect(a!.accountedBy).toEqual([]);
    expect(a!.unattributed).toBe(true);
  });
});

describe('PublishedSnapshotBaselinePin (story 4.4 seam)', () => {
  it('requires baselineVersionSeq', () => {
    expect(publishedSnapshotBaselinePin({ baselineVersionSeq: 3 })).toEqual({
      baselineVersionSeq: 3,
    });
    expect(() => publishedSnapshotBaselinePin({})).toThrow(/baselineVersionSeq/);
    expect(() => publishedSnapshotBaselinePin({ baselineVersionSeq: 0 })).toThrow(
      /baselineVersionSeq/,
    );
    expect(() => publishedSnapshotBaselinePin(null)).toThrow(/object/);
  });
});
