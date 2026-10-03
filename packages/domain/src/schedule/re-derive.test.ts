import { describe, expect, it } from 'vitest';
import { encode, stringify } from '../present/codec';
import { ENGINE_VERSION } from './engine-version';
import { CORPUS } from './corpus/index';
import { recalculate } from './recalculate';
import { reDeriveStoredRun } from './re-derive';
import {
  encodeScheduleInputs,
  encodeScheduleOutputs,
  stripRemainingDays,
  type StoredScheduleOutputs,
} from './stored-run';

function storedFromCorpus(caseId: string, prevInputs: unknown | null = null) {
  const c = CORPUS.find((x) => x.id === caseId)!;
  const result = recalculate(c.inputs, null);
  expect(result.kind).toBe('scheduled');
  if (result.kind !== 'scheduled') throw new Error('expected scheduled');
  const causes = new Map(result.outputs.wps.map((r) => [r.wpId, r.cause] as const));
  const storedIn = encodeScheduleInputs(c.inputs, causes, { calendarVersionSeq: 1 });
  const storedOut = encodeScheduleOutputs(result.outputs, storedIn.wps.map((w) => w.id));
  return {
    engineVersion: c.engineVersion,
    inputs: encode(storedIn),
    outputs: encode(storedOut),
    prevInputs,
  };
}

describe('reDeriveStoredRun (story 4.2)', () => {
  it('matches stored outputs via AD-4 codec (null prev)', () => {
    const pin = storedFromCorpus('jp-weekend-slip', null);
    const gate = reDeriveStoredRun(pin);
    expect(gate).toEqual({ ok: true });
  });

  it('matches when prevInputs are supplied (cause overlay path)', () => {
    const prev = storedFromCorpus('jp-weekend-slip');
    const c = CORPUS.find((x) => x.id === 'jp-weekend-slip')!;
    // Second "run": bump duration so early dates move and causes fire.
    const nextInputs = {
      ...c.inputs,
      wps: c.inputs.wps.map((w) =>
        w.id === 'A' ? { ...w, durationDays: (w.durationDays ?? 0) + 2 } : w,
      ),
    };
    const prevDomain = c.inputs;
    const result = recalculate(nextInputs, prevDomain);
    expect(result.kind).toBe('scheduled');
    if (result.kind !== 'scheduled') return;
    const causes = new Map(result.outputs.wps.map((r) => [r.wpId, r.cause] as const));
    const storedIn = encodeScheduleInputs(nextInputs, causes, { calendarVersionSeq: 1 });
    const storedOut = encodeScheduleOutputs(result.outputs, storedIn.wps.map((w) => w.id));

    const gate = reDeriveStoredRun({
      engineVersion: ENGINE_VERSION,
      inputs: encode(storedIn),
      outputs: encode(storedOut),
      prevInputs: prev.inputs,
    });
    expect(gate).toEqual({ ok: true });
    // Sanity: at least one cause is non-null when dates moved.
    expect(result.outputs.wps.some((r) => r.cause !== null)).toBe(true);
  });

  it('fails when critical-path order is shuffled (membership alone is insufficient)', () => {
    const pin = storedFromCorpus('jp-weekend-slip');
    const parsed = JSON.parse(stringify(encode(pin.outputs))) as StoredScheduleOutputs;
    expect(parsed.criticalPath.length).toBeGreaterThanOrEqual(2);
    const shuffled: StoredScheduleOutputs = {
      ...parsed,
      criticalPath: [...parsed.criticalPath].reverse(),
    };
    // Same membership, different order — codec compare must fail (AR-55).
    expect([...shuffled.criticalPath].sort()).toEqual([...parsed.criticalPath].sort());
    expect(shuffled.criticalPath).not.toEqual(parsed.criticalPath);

    const gate = reDeriveStoredRun({
      ...pin,
      outputs: encode(shuffled),
    });
    expect(gate.ok).toBe(false);
    if (gate.ok) return;
    expect(gate.reason).toBe('mismatch');
  });

  it('dispatches under the pin\'s own engine_version (registered key)', () => {
    const pin = storedFromCorpus('milestone');
    expect(pin.engineVersion).toBe(ENGINE_VERSION);
    expect(reDeriveStoredRun(pin)).toEqual({ ok: true });
  });

  it('throws RangeError naming an unknown engine_version', () => {
    const pin = storedFromCorpus('jp-weekend-slip');
    expect(() =>
      reDeriveStoredRun({ ...pin, engineVersion: 'schedule-never-registered' }),
    ).toThrowError(RangeError);
    expect(() =>
      reDeriveStoredRun({ ...pin, engineVersion: 'schedule-never-registered' }),
    ).toThrowError('unknown engine_version "schedule-never-registered"');
  });

  it('refuses incomplete pin when outputs are null', () => {
    const pin = storedFromCorpus('jp-weekend-slip');
    const gate = reDeriveStoredRun({ ...pin, outputs: null });
    expect(gate.ok).toBe(false);
    if (gate.ok) return;
    expect(gate.reason).toBe('incomplete_pin');
    expect(gate.message).toMatch(/outputs are null/);
  });

  it('refuses incomplete pin when haltedReason is set', () => {
    const pin = storedFromCorpus('jp-weekend-slip');
    const gate = reDeriveStoredRun({ ...pin, haltedReason: 'calendar_range' });
    expect(gate.ok).toBe(false);
    if (gate.ok) return;
    expect(gate.reason).toBe('incomplete_pin');
    expect(gate.message).toMatch(/haltedReason=calendar_range/);
  });

  it('stripRemainingDays is applied on the re-derived side (stored had no remainingDays)', () => {
    const c = CORPUS.find((x) => x.id === 'mid-flight')!;
    const result = recalculate(c.inputs, null);
    expect(result.kind).toBe('scheduled');
    if (result.kind !== 'scheduled') return;
    expect(result.outputs.wps.some((r) => r.remainingDays !== null)).toBe(true);
    const causes = new Map(result.outputs.wps.map((r) => [r.wpId, r.cause] as const));
    const storedIn = encodeScheduleInputs(c.inputs, causes, { calendarVersionSeq: 1 });
    const storedOut = encodeScheduleOutputs(
      stripRemainingDays(result.outputs),
      storedIn.wps.map((w) => w.id),
    );
    expect(stringify(encode(storedOut))).not.toContain('remainingDays');
    expect(
      reDeriveStoredRun({
        engineVersion: c.engineVersion,
        inputs: encode(storedIn),
        outputs: encode(storedOut),
        prevInputs: null,
      }),
    ).toEqual({ ok: true });
  });
});
