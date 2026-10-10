/**
 * Review Accept Observed→Recorded server action (story 6.4).
 * Prove refuse skips revalidate; land revalidates; Observed is re-read (client % ignored).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const revalidatePath = vi.hoisted(() => vi.fn());
const requestContext = vi.hoisted(() =>
  vi.fn(async () => ({ userId: 'u1', role: 'pm' })),
);
const getProjectReview = vi.hoisted(() => vi.fn());
const planChange = vi.hoisted(() => vi.fn());

vi.mock('next/cache', () => ({ revalidatePath }));
vi.mock('@/server/composition', () => ({
  requestContext,
  getProjectReview,
  planChange,
}));

const { acceptObservedPctAction } = await import('./actions');

beforeEach(() => {
  revalidatePath.mockReset();
  getProjectReview.mockReset();
  planChange.mockReset();
  requestContext.mockClear();
});

function reviewWithObserved(wpId: string, pct: { num: bigint; den: bigint }) {
  return {
    ok: true as const,
    value: {
      bundle: {
        wps: [{ id: wpId, isLeaf: true, isMilestone: false }],
      },
      review: {
        evm: {
          perWp: [{ wpId, pctComplete: pct }],
        },
      },
    },
  };
}

describe('acceptObservedPctAction', () => {
  it('refuses empty reason without reading Review or writing', async () => {
    const outcome = await acceptObservedPctAction({
      projectId: 'p1',
      wpId: 'wp1',
      reason: '   ',
    });
    expect(outcome).toEqual({
      ok: false,
      code: 'invalid_input',
      messageKey: 'review.accept_reason_required',
    });
    expect(getProjectReview).not.toHaveBeenCalled();
    expect(planChange).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('refuses when Observed for wpId is unavailable', async () => {
    getProjectReview.mockResolvedValueOnce({
      ok: true,
      value: {
        bundle: { wps: [{ id: 'wp1', isLeaf: true, isMilestone: false }] },
        review: { evm: { perWp: [] } },
      },
    });
    const outcome = await acceptObservedPctAction({
      projectId: 'p1',
      wpId: 'wp1',
      reason: 'QA pending',
    });
    expect(outcome.ok).toBe(false);
    expect(planChange).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('writes the re-read Observed ratio with pm_override and revalidates', async () => {
    getProjectReview.mockResolvedValueOnce(
      reviewWithObserved('wp1', { num: 60n, den: 100n }),
    );
    planChange.mockResolvedValueOnce({ ok: true, value: { seq: 1 } });
    const outcome = await acceptObservedPctAction({
      projectId: 'p1',
      wpId: 'wp1',
      reason: 'QA sign-off pending',
    });
    expect(outcome).toEqual({ ok: true });
    expect(planChange).toHaveBeenCalledWith(
      {
        kind: 'patch_recorded_pct',
        projectId: 'p1',
        wpId: 'wp1',
        recordedPctNum: 60n,
        recordedPctDen: 100n,
        reason: 'QA sign-off pending',
        source: 'pm_override',
      },
      expect.anything(),
    );
    expect(revalidatePath).toHaveBeenCalledWith('/p/p1/review');
    expect(revalidatePath).toHaveBeenCalledWith('/p/p1/plan');
  });

  it('skips revalidate when the fence refuses', async () => {
    getProjectReview.mockResolvedValueOnce(
      reviewWithObserved('wp1', { num: 1n, den: 2n }),
    );
    planChange.mockResolvedValueOnce({
      ok: false,
      error: { code: 'invalid_input', messageKey: 'errors.invalid_input' },
    });
    const outcome = await acceptObservedPctAction({
      projectId: 'p1',
      wpId: 'wp1',
      reason: 'reason',
    });
    expect(outcome).toEqual({
      ok: false,
      code: 'invalid_input',
      messageKey: 'errors.invalid_input',
    });
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});
