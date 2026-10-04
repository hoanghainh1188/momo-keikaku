import { describe, expect, it } from 'vitest';
import {
  encode,
  encodeScheduleInputs,
  encodeScheduleOutputs,
  recalculate,
} from '@momo/domain';
import { CAL, inputs, wp } from '../../../../tests/support/schedule-fixtures';
import { evaluateBaselineSetGates, evaluateReBaselineGates } from './gates';

const leaf = (
  id: string,
  opts?: { durationDays?: number | null; isMilestone?: boolean; isCatchAll?: boolean },
) => ({
  wpId: id,
  plannedMh: 1_000n,
  isMilestone: opts?.isMilestone ?? false,
  isCatchAll: opts?.isCatchAll ?? false,
  durationDays: opts?.durationDays === undefined ? 3 : opts.durationDays,
});

function successfulPin(wpId: string) {
  const scheduleInputs = inputs([wp(wpId, { durationDays: 3 })], [], {
    projectStart: '2026-09-01',
    dataDate: '2026-10-05',
    calendar: CAL,
  });
  const result = recalculate(scheduleInputs, null);
  if (result.kind !== 'scheduled') throw new Error('fixture must schedule');
  const storedInputs = encodeScheduleInputs(scheduleInputs, new Map(), {
    calendarVersionSeq: 1,
    milestoneIds: new Set(),
  });
  const orderedWpIds = storedInputs.wps.map((w) => w.id);
  const storedOutputs = encodeScheduleOutputs(result.outputs, orderedWpIds);
  return {
    seq: 1,
    inputs: encode(storedInputs),
    outputs: encode(storedOutputs),
  };
}

describe('evaluateBaselineSetGates', () => {
  it('accepts a schedulable plan with a successful latest run', () => {
    const pin = successfulPin('wp-a');
    const result = evaluateBaselineSetGates({
      projectStart: '2026-09-01',
      existingBaselineSeq: null,
      latestRun: { ...pin, haltedReason: null },
      successfulRun: pin,
      leaves: [leaf('wp-a')],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.scheduleRunSeq).toBe(1);
    expect(result.leafDates.get('wp-a')).toEqual({
      start: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      finish: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
    });
  });

  it('refuses when a Baseline already exists', () => {
    const pin = successfulPin('wp-a');
    const result = evaluateBaselineSetGates({
      projectStart: '2026-09-01',
      existingBaselineSeq: 1,
      latestRun: { ...pin, haltedReason: null },
      successfulRun: pin,
      leaves: [leaf('wp-a')],
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('already_exists');
    expect(result.details.hint).toEqual(['use_rebaseline']);
  });

  it('refuses when there is no run', () => {
    const result = evaluateBaselineSetGates({
      projectStart: '2026-09-01',
      existingBaselineSeq: null,
      latestRun: null,
      successfulRun: null,
      leaves: [leaf('wp-a')],
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('no_successful_run');
  });

  it('refuses when the latest run is halted even if an older successful run exists', () => {
    const pin = successfulPin('wp-a');
    const result = evaluateBaselineSetGates({
      projectStart: '2026-09-01',
      existingBaselineSeq: null,
      latestRun: {
        seq: 3,
        haltedReason: 'calendar_range',
        outputs: null,
        inputs: pin.inputs,
      },
      successfulRun: { ...pin, seq: 2 },
      leaves: [leaf('wp-a')],
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('halted_or_missing_run');
  });

  it('refuses when Project start is missing', () => {
    const pin = successfulPin('wp-a');
    const result = evaluateBaselineSetGates({
      projectStart: null,
      existingBaselineSeq: null,
      latestRun: { ...pin, haltedReason: null },
      successfulRun: pin,
      leaves: [leaf('wp-a', { durationDays: null })],
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('no_project_start');
    expect(result.notSchedulableCount).toBe(0);
    expect(result.blockingWpIds).toContain('wp-a');
  });

  it('refuses incomplete leaves missing duration with blockers', () => {
    const pin = successfulPin('wp-a');
    const result = evaluateBaselineSetGates({
      projectStart: '2026-09-01',
      existingBaselineSeq: null,
      latestRun: { ...pin, haltedReason: null },
      successfulRun: pin,
      leaves: [leaf('wp-a'), leaf('wp-b', { durationDays: null })],
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('incomplete_plan');
    expect(result.blockingWpIds).toContain('wp-b');
  });

  it('refuses incomplete_plan when the Project has zero leaves (F11)', () => {
    const pin = successfulPin('wp-a');
    const result = evaluateBaselineSetGates({
      projectStart: '2026-09-01',
      existingBaselineSeq: null,
      latestRun: { ...pin, haltedReason: null },
      successfulRun: pin,
      leaves: [],
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('incomplete_plan');
    expect(result.blockingWpIds).toEqual([]);
    expect(result.details.baseline).toEqual(['incomplete_plan']);
  });
});

describe('evaluateReBaselineGates', () => {
  it('accepts when a Baseline already exists and the plan is schedulable', () => {
    const pin = successfulPin('wp-a');
    const result = evaluateReBaselineGates({
      projectStart: '2026-09-01',
      existingBaselineSeq: 1,
      latestRun: { ...pin, haltedReason: null },
      successfulRun: pin,
      leaves: [leaf('wp-a')],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.scheduleRunSeq).toBe(1);
  });

  it('refuses when no Baseline exists yet', () => {
    const pin = successfulPin('wp-a');
    const result = evaluateReBaselineGates({
      projectStart: '2026-09-01',
      existingBaselineSeq: null,
      latestRun: { ...pin, haltedReason: null },
      successfulRun: pin,
      leaves: [leaf('wp-a')],
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('no_baseline');
    expect(result.details.hint).toEqual(['use_set_baseline']);
  });

  it('shares incomplete-plan refuse with Set', () => {
    const pin = successfulPin('wp-a');
    const result = evaluateReBaselineGates({
      projectStart: '2026-09-01',
      existingBaselineSeq: 1,
      latestRun: { ...pin, haltedReason: null },
      successfulRun: pin,
      leaves: [leaf('wp-a'), leaf('wp-b', { durationDays: null })],
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('incomplete_plan');
    expect(result.blockingWpIds).toContain('wp-b');
  });

  it('shares zero-leaf incomplete_plan refuse with Set (F11)', () => {
    const pin = successfulPin('wp-a');
    const result = evaluateReBaselineGates({
      projectStart: '2026-09-01',
      existingBaselineSeq: 1,
      latestRun: { ...pin, haltedReason: null },
      successfulRun: pin,
      leaves: [],
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('incomplete_plan');
    expect(result.blockingWpIds).toEqual([]);
  });

  it('shares halted-head refuse with Set', () => {
    const older = successfulPin('wp-a');
    const result = evaluateReBaselineGates({
      projectStart: '2026-09-01',
      existingBaselineSeq: 1,
      latestRun: {
        seq: 2,
        haltedReason: 'calendar_range',
        outputs: null,
        inputs: older.inputs,
      },
      successfulRun: older,
      leaves: [leaf('wp-a')],
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('halted_or_missing_run');
  });
});
