import { describe, expect, it } from 'vitest';
import { buildBaselineWpRows } from './append-baseline-version';
const leaf = (wpId) => ({
    wpId,
    plannedMh: 1000n,
    isMilestone: false,
    isCatchAll: false,
    durationDays: 3,
});
describe('buildBaselineWpRows', () => {
    it('maps leaf projections onto append rows with fresh ids', () => {
        let n = 0;
        const rows = buildBaselineWpRows([leaf('wp-a'), leaf('wp-b')], new Map([
            ['wp-a', { start: '2026-09-01', finish: '2026-09-03' }],
            ['wp-b', { start: '2026-09-04', finish: '2026-09-06' }],
        ]), () => `id-${++n}`);
        expect(rows).toEqual([
            {
                id: 'id-1',
                wpId: 'wp-a',
                start: '2026-09-01',
                finish: '2026-09-03',
                baselineMh: 1000n,
                isMilestone: false,
                isCatchAll: false,
            },
            {
                id: 'id-2',
                wpId: 'wp-b',
                start: '2026-09-04',
                finish: '2026-09-06',
                baselineMh: 1000n,
                isMilestone: false,
                isCatchAll: false,
            },
        ]);
    });
    it('refuses incomplete_plan when a leaf has no dates', () => {
        try {
            buildBaselineWpRows([leaf('wp-missing')], new Map(), () => 'id-1');
            expect.fail('expected refuse');
        }
        catch (error) {
            expect(error).toMatchObject({
                code: 'invalid_input',
                details: {
                    baseline: ['incomplete_plan'],
                    blockingWpIds: ['wp-missing'],
                },
            });
        }
    });
});
