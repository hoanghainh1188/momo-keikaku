import { describe, expect, it } from 'vitest';
import { recalculate, type ScheduleEdge, type ScheduleWp } from './recalculate';
import { seededUint32 } from '../../../../tests/support/shuffle-invariant';
import { calendar, edge, inputs, scheduled, wp } from '../../../../tests/support/schedule-fixtures';

// Story 2.7's wall-clock budget, split out of `recalculate.constraints.test.ts` so it runs under
// `pnpm test:nfr` (one file at a time) rather than beside 150 files in `pnpm test`, where it timed
// the machine's contention instead of `recalculate`. See `NFR_TESTS` in `vitest.config.ts`.

describe('recalculate — soft constraints at scale (NFR budget)', () => {
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
