/**
 * Story 5.9 — unit coverage for deleteWp mapping side-effects (matrix: deleteWp / release).
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../db/src/watermark-lock', () => ({
  lockWatermark: vi.fn().mockResolvedValue(undefined),
  lockWatermarkShared: vi.fn().mockResolvedValue(undefined),
  holdsWatermark: vi.fn().mockReturnValue(false),
}));

import {
  disableRulesTargeting,
  reassignMappingsFromWp,
  type WriteStamp,
} from '../../../db/src/repo-writes';
import type { Bound } from '../../../db/src/bound';

const STAMP: WriteStamp = { actor: 'pm-1', at: new Date('2026-10-06T12:00:00.000Z') };

describe('disableRulesTargeting', () => {
  it('deletes mapping_rule rows targeting the WP', async () => {
    const where = vi.fn().mockResolvedValue(undefined);
    const del = vi.fn().mockReturnValue({ where });
    const bound = { tx: { delete: del }, tenantId: 'ten-1' } as unknown as Bound;
    await disableRulesTargeting(bound, 'prj-1', 'wp-1');
    expect(del).toHaveBeenCalled();
    expect(where).toHaveBeenCalled();
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
    const bound = { tx, tenantId: 'ten-1' } as unknown as Bound;
    await reassignMappingsFromWp(bound, STAMP, 'prj-1', 'wp-1');
    expect(insert).not.toHaveBeenCalled();
  });
});
