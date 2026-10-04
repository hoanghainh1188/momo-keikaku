import { describe, expect, it } from 'vitest';
import type { CalendarVersion } from '../calendar';
import {
  calendarDayDelta,
  divergenceFromPinned,
  durationDaysFromDates,
  planBaselineCompare,
  signedDateDeltaDays,
  signedIntDelta,
  signedMhDelta,
} from './divergence-from-pin';
import type { StoredScheduleInputs, StoredScheduleOutputs } from './stored-run';

const WEEKEND_CAL: CalendarVersion = {
  rangeStart: '2026-09-01',
  rangeEnd: '2026-09-30',
  // Weekends in September 2026 (exhaustive CalendarVersion set).
  nonWorkingDays: [
    '2026-09-05',
    '2026-09-06',
    '2026-09-12',
    '2026-09-13',
    '2026-09-19',
    '2026-09-20',
    '2026-09-26',
    '2026-09-27',
  ],
};

function pinPair(opts: {
  readonly wpId: string;
  readonly durationDays: number;
  readonly plannedMh: bigint;
  readonly earlyStart: string;
  readonly earlyFinish: string;
}): { readonly inputs: StoredScheduleInputs; readonly outputs: StoredScheduleOutputs } {
  const inputs: StoredScheduleInputs = {
    projectId: 'p1',
    wps: [
      {
        id: opts.wpId,
        wbsCode: '1.1',
        parentId: null,
        isLeaf: true,
        isMilestone: false,
        plannedMh: opts.plannedMh,
        durationDays: opts.durationDays,
        constraintType: 'asap',
        constraintDate: null,
        actualStart: null,
        actualFinish: null,
        recordedPct: null,
      },
    ],
    edges: [],
    projectStart: '2026-09-01',
    dataDate: '2026-09-10',
    projectFinish: null,
    calendar: { ...WEEKEND_CAL, versionSeq: 1 },
    watermarks: { wpStatusSeqMax: 0, pctOverrideSeqMax: 0 },
    causes: [null],
  };
  const outputs: StoredScheduleOutputs = {
    wps: [
      {
        state: 'remaining',
        earlyStart: opts.earlyStart,
        earlyFinish: opts.earlyFinish,
        lateStart: opts.earlyStart,
        lateFinish: opts.earlyFinish,
        floatDays: 0,
        isCritical: true,
        notSchedulableReason: null,
        plannedMh: opts.plannedMh,
        drivingPredecessors: [],
        cause: null,
      },
    ],
    outOfSequence: [],
    notSchedulable: [],
    violations: [],
    anchor: { kind: 'computed_finish', date: opts.earlyFinish },
    computedFinish: opts.earlyFinish,
    criticalPath: [0],
  };
  return { inputs, outputs };
}

describe('divergenceFromPinned (story 4.5 / AR-22)', () => {
  it('compares baseline_wp dates to pin outputs and effort to pin inputs', () => {
    const { inputs, outputs } = pinPair({
      wpId: 'leaf-a',
      durationDays: 5,
      plannedMh: 40_000n,
      earlyStart: '2026-09-07',
      earlyFinish: '2026-09-11',
    });
    const rows = divergenceFromPinned({
      baselineWps: [
        {
          wpId: 'leaf-a',
          start: '2026-09-01',
          finish: '2026-09-07',
          baselineMh: 32_000n,
        },
      ],
      pinnedInputs: inputs,
      pinnedOutputs: outputs,
    });
    expect(rows).toHaveLength(1);
    const row = rows[0]!;
    expect(row.pinEarlyStart).toBe('2026-09-07');
    expect(row.pinEarlyFinish).toBe('2026-09-11');
    expect(row.pinDurationDays).toBe(5);
    expect(row.pinPlannedMh).toBe(40_000n);
    // Working-day move Mon 1 Sep → Mon 7 Sep = +4 working days (skipping weekend).
    expect(row.startDeltaDays).toBe(4);
    expect(row.finishDeltaDays).toBe(4);
    expect(row.effortDeltaMh).toBe(8_000n);
  });

  it('never invents pin figures from absent wp_id (no wp_schedule fallback)', () => {
    const { inputs, outputs } = pinPair({
      wpId: 'other',
      durationDays: 3,
      plannedMh: 1_000n,
      earlyStart: '2026-09-01',
      earlyFinish: '2026-09-03',
    });
    const [row] = divergenceFromPinned({
      baselineWps: [
        { wpId: 'missing', start: '2026-09-01', finish: '2026-09-03', baselineMh: 1_000n },
      ],
      pinnedInputs: inputs,
      pinnedOutputs: outputs,
    });
    expect(row!.pinEarlyStart).toBeNull();
    expect(row!.effortDeltaMh).toBeNull();
    expect(row!.startDeltaDays).toBeNull();
  });

  it('uses calendar-day Δ when no calendar is available', () => {
    expect(calendarDayDelta('2026-09-01', '2026-09-04')).toBe(3);
    expect(calendarDayDelta('2026-09-04', '2026-09-01')).toBe(-3);
    expect(signedDateDeltaDays('2026-09-01', '2026-09-04', null)).toBe(3);
  });

  it('signed helpers treat null as N/A and zero as 0', () => {
    expect(signedIntDelta(5, 5)).toBe(0);
    expect(signedIntDelta(5, 8)).toBe(3);
    expect(signedIntDelta(null, 8)).toBeNull();
    expect(signedMhDelta(1_000n, 1_000n)).toBe(0n);
    expect(signedMhDelta(1_000n, 500n)).toBe(-500n);
    expect(durationDaysFromDates('2026-09-01', '2026-09-03', null)).toBe(3);
  });
});

describe('planBaselineCompare (story 4.5 Plan columns)', () => {
  it('computes Current − Baseline signed Δ for leaf rows', () => {
    const row = planBaselineCompare({
      wpId: 'leaf-a',
      isLeaf: true,
      baseline: {
        wpId: 'leaf-a',
        start: '2026-09-01',
        finish: '2026-09-07',
        baselineMh: 32_000n,
      },
      baselineDurationDays: 5,
      derivedStart: '2026-09-07',
      derivedFinish: '2026-09-11',
      durationDays: 5,
      plannedMh: 40_000n,
      calendar: WEEKEND_CAL,
    });
    expect(row.baselineStart).toBe('2026-09-01');
    expect(row.baselineDurationDays).toBe(5);
    expect(row.startDeltaDays).toBe(4);
    expect(row.finishDeltaDays).toBe(4);
    expect(row.durationDeltaDays).toBe(0);
    expect(row.effortDeltaMh).toBe(8_000n);
  });

  it('shows Baseline-side N/A for summary rows while keeping Current Plan figures', () => {
    const row = planBaselineCompare({
      wpId: 'summary',
      isLeaf: false,
      baseline: {
        wpId: 'summary',
        start: '2026-09-01',
        finish: '2026-09-10',
        baselineMh: 99_000n,
      },
      baselineDurationDays: 8,
      derivedStart: '2026-09-01',
      derivedFinish: '2026-09-10',
      durationDays: null,
      plannedMh: 40_000n,
      calendar: WEEKEND_CAL,
    });
    expect(row.baselineStart).toBeNull();
    expect(row.baselineFinish).toBeNull();
    expect(row.baselineDurationDays).toBeNull();
    expect(row.baselineMh).toBeNull();
    expect(row.derivedStart).toBe('2026-09-01');
    expect(row.plannedMh).toBe(40_000n);
    expect(row.startDeltaDays).toBeNull();
    expect(row.effortDeltaMh).toBeNull();
  });
});
