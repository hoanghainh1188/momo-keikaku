/**
 * Story 5.9 — unit coverage for deleteWp mapping side-effects (matrix: deleteWp / release).
 */
import { describe, expect, it, vi } from 'vitest';
vi.mock('../../../db/src/watermark-lock', () => ({
    lockWatermark: vi.fn().mockResolvedValue(undefined),
    lockWatermarkShared: vi.fn().mockResolvedValue(undefined),
    holdsWatermark: vi.fn().mockReturnValue(false),
}));
import { disableRulesTargeting, reassignMappingsFromWp, } from '../../../db/src/repo-writes';
const STAMP = { actor: 'pm-1', at: new Date('2026-10-06T12:00:00.000Z') };
describe('disableRulesTargeting', () => {
    it('soft-deletes (never hard-deletes) mapping_rule rows targeting the WP (story 5.10)', async () => {
        const where = vi.fn().mockResolvedValue(undefined);
        const set = vi.fn().mockReturnValue({ where });
        const update = vi.fn().mockReturnValue({ set });
        const del = vi.fn();
        const bound = { tx: { update, delete: del }, tenantId: 'ten-1' };
        await disableRulesTargeting(bound, 'prj-1', 'wp-1', STAMP.at);
        expect(update).toHaveBeenCalled();
        expect(set).toHaveBeenCalledWith({ deletedAt: STAMP.at });
        expect(where).toHaveBeenCalled();
        expect(del).not.toHaveBeenCalled();
    });
});
describe('reassignMappingsFromWp', () => {
    it('is a no-op when no Tickets are mapped to the WP', async () => {
        const insert = vi.fn();
        const tx = {
            select: vi.fn(() => ({
                from: vi.fn(() => ({
                    where: vi.fn().mockResolvedValue([]),
                })),
            })),
            insert,
        };
        const bound = { tx, tenantId: 'ten-1' };
        await reassignMappingsFromWp(bound, STAMP, 'prj-1', 'wp-1');
        expect(insert).not.toHaveBeenCalled();
    });
});
