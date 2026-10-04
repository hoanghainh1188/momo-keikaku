/**
 * Baseline Set / Re-baseline server actions (story 4.1 / 4.3 + retro F9).
 * Prove refuse returns BaselineWriteOutcome and does not revalidate; land revalidates.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const revalidatePath = vi.hoisted(() => vi.fn());
const requestContext = vi.hoisted(() =>
  vi.fn(async () => ({ userId: 'u1', role: 'pm' })),
);
const setProjectBaseline = vi.hoisted(() => vi.fn());
const reProjectBaseline = vi.hoisted(() => vi.fn());

vi.mock('next/cache', () => ({ revalidatePath }));
vi.mock('@/server/composition', () => ({
  requestContext,
  setProjectBaseline,
  reProjectBaseline,
}));

const { setBaselineAction, reBaselineAction } = await import('./actions');
const { planWriteRefuseMessage } = await import('@/lib/plan-write-refuse');

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [name, value] of Object.entries(fields)) data.set(name, value);
  return data;
}

beforeEach(() => {
  revalidatePath.mockReset();
  setProjectBaseline.mockReset();
  reProjectBaseline.mockReset();
  requestContext.mockClear();
});

describe('setBaselineAction', () => {
  it('returns refuse and skips revalidate when writeLanded is false (incomplete_plan)', async () => {
    setProjectBaseline.mockResolvedValueOnce({
      ok: false,
      error: {
        code: 'invalid_input',
        messageKey: 'errors.invalid_input',
        details: { baseline: ['incomplete_plan'] },
      },
    });
    const outcome = await setBaselineAction(form({ projectId: 'p1' }));
    expect(outcome).toEqual({
      ok: false,
      code: 'invalid_input',
      messageKey: 'errors.invalid_input',
      details: { baseline: ['incomplete_plan'] },
    });
    // Same mapper the Review/Plan/Baselines controls pass into role=alert.
    expect(planWriteRefuseMessage(outcome)).toBe('baseline: incomplete_plan');
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('revalidates Review / Plan / Baselines only when the write landed', async () => {
    setProjectBaseline.mockResolvedValueOnce({ ok: true, value: { versionSeq: 1 } });
    const outcome = await setBaselineAction(form({ projectId: 'p1' }));
    expect(outcome).toEqual({ ok: true });
    expect(revalidatePath).toHaveBeenCalledWith('/p/p1/review');
    expect(revalidatePath).toHaveBeenCalledWith('/p/p1/baselines');
    expect(revalidatePath).toHaveBeenCalledWith('/p/p1/plan');
  });

  it('returns local refuse for empty projectId without calling the use case', async () => {
    const outcome = await setBaselineAction(form({ projectId: '' }));
    expect(outcome).toEqual({
      ok: false,
      code: 'invalid_input',
      messageKey: 'errors.invalid_input',
    });
    expect(setProjectBaseline).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

describe('reBaselineAction', () => {
  it('returns refuse and skips revalidate when writeLanded is false', async () => {
    reProjectBaseline.mockResolvedValueOnce({
      ok: false,
      error: {
        code: 'invalid_input',
        messageKey: 'errors.invalid_input',
        details: { baseline: ['incomplete_plan'] },
      },
    });
    const outcome = await reBaselineAction(
      form({ projectId: 'p1', reason: 'scope reset after CR' }),
    );
    expect(outcome).toEqual({
      ok: false,
      code: 'invalid_input',
      messageKey: 'errors.invalid_input',
      details: { baseline: ['incomplete_plan'] },
    });
    expect(planWriteRefuseMessage(outcome)).toBe('baseline: incomplete_plan');
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('returns local refuse for empty projectId without calling the use case', async () => {
    const outcome = await reBaselineAction(form({ projectId: '', reason: 'x' }));
    expect(outcome).toEqual({
      ok: false,
      code: 'invalid_input',
      messageKey: 'errors.invalid_input',
    });
    expect(reProjectBaseline).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('returns local refuse for non-string reason without calling the use case', async () => {
    const data = new FormData();
    data.set('projectId', 'p1');
    data.set('reason', new File([], 'note.txt'));
    const outcome = await reBaselineAction(data);
    expect(outcome).toEqual({
      ok: false,
      code: 'invalid_input',
      messageKey: 'errors.invalid_input',
    });
    expect(reProjectBaseline).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('revalidates only when the write landed', async () => {
    reProjectBaseline.mockResolvedValueOnce({ ok: true, value: { versionSeq: 2 } });
    const outcome = await reBaselineAction(
      form({ projectId: 'p1', reason: 'scope reset after CR' }),
    );
    expect(outcome).toEqual({ ok: true });
    expect(revalidatePath).toHaveBeenCalledWith('/p/p1/review');
    expect(revalidatePath).toHaveBeenCalledWith('/p/p1/baselines');
    expect(revalidatePath).toHaveBeenCalledWith('/p/p1/plan');
  });
});
