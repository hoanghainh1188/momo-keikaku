/**
 * Epic 4 retro F10 — unit proof that the Plan-grid loader resolves one head seq,
 * then loads wps + pin for that seq only (never re-selects max independently).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const latestVersionSeq = vi.fn();
const loadBaselineWpsForVersion = vi.fn();
const scheduleRunSeqForVersion = vi.fn();
const loadActiveBaselineWps = vi.fn();
const latestPinnedScheduleRunSeq = vi.fn();
const runBySeq = vi.fn();

vi.mock('../../../db/src/repositories/baseline', () => ({
  baselineRepositoryOn: () => ({
    latestVersionSeq,
    loadBaselineWpsForVersion,
    scheduleRunSeqForVersion,
    loadActiveBaselineWps,
    latestPinnedScheduleRunSeq,
  }),
}));

vi.mock('../../../db/src/repositories/schedule', () => ({
  scheduleRepositoryOn: () => ({
    runBySeq,
  }),
}));

const { loadActiveBaselineForGrid } = await import('./active-baseline-for-grid');

describe('loadActiveBaselineForGrid (F10 one-head)', () => {
  beforeEach(() => {
    latestVersionSeq.mockReset();
    loadBaselineWpsForVersion.mockReset();
    scheduleRunSeqForVersion.mockReset();
    loadActiveBaselineWps.mockReset();
    latestPinnedScheduleRunSeq.mockReset();
    runBySeq.mockReset();
  });

  it('loads wps + pin by the same resolved seq; never re-selects max', async () => {
    latestVersionSeq.mockResolvedValue(2);
    loadBaselineWpsForVersion.mockResolvedValue([
      {
        wpId: 'wp-a',
        start: '2026-09-01',
        finish: '2026-09-03',
        baselineMh: 1_000n,
      },
    ]);
    scheduleRunSeqForVersion.mockResolvedValue(9);
    runBySeq.mockResolvedValue(null);

    const head = await loadActiveBaselineForGrid(
      { tx: {} as never, tenantId: 't1' },
      'proj-1',
    );

    expect(latestVersionSeq).toHaveBeenCalledOnce();
    expect(loadBaselineWpsForVersion).toHaveBeenCalledWith('proj-1', 2);
    expect(scheduleRunSeqForVersion).toHaveBeenCalledWith('proj-1', 2);
    expect(loadActiveBaselineWps).not.toHaveBeenCalled();
    expect(latestPinnedScheduleRunSeq).not.toHaveBeenCalled();
    expect(head.versionSeq).toBe(2);
    expect(head.pinSeq).toBe(9);
    expect(head.baselineByWp.get('wp-a')?.baselineMh).toBe(1_000n);
  });

  it('fails closed to empty when the resolved seq has no pin row', async () => {
    latestVersionSeq.mockResolvedValue(3);
    loadBaselineWpsForVersion.mockResolvedValue([]);
    scheduleRunSeqForVersion.mockResolvedValue(null);

    const head = await loadActiveBaselineForGrid(
      { tx: {} as never, tenantId: 't1' },
      'proj-1',
    );

    expect(head.versionSeq).toBeNull();
    expect(head.pinSeq).toBeNull();
    expect(head.baselineByWp.size).toBe(0);
    expect(runBySeq).not.toHaveBeenCalled();
  });
});
