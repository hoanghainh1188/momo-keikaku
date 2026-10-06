/**
 * Story 5.9 — unit coverage for mapped-leaf → summary refusal (matrix: Mapped leaf → summary).
 */
import { describe, expect, it, vi } from 'vitest';
import { assertMappedLeafMayBecomeSummary } from './mapped-leaf-guard';
import type { Bound } from '../../../db/src/bound';

function chainSelect(results: { wp?: unknown[]; head?: unknown[] }) {
  let call = 0;
  return {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => {
          call += 1;
          if (call === 1) {
            // work_package lookup
            return Promise.resolve(results.wp ?? []);
          }
          // mapping_head lookup — may be followed by .limit(1)
          const rows = results.head ?? [];
          const p = Promise.resolve(rows) as Promise<unknown[]> & {
            limit: (n: number) => Promise<unknown[]>;
          };
          p.limit = () => Promise.resolve(rows);
          return p;
        }),
      })),
    })),
  };
}

describe('assertMappedLeafMayBecomeSummary', () => {
  it('refuses when a live leaf has a mapped Ticket head', async () => {
    const tx = chainSelect({
      wp: [{ isLeaf: true, deletedAt: null }],
      head: [{ ticketId: 'ISSUE-1' }],
    });
    const bound = { tx, tenantId: 'ten-1' } as unknown as Bound;
    await expect(assertMappedLeafMayBecomeSummary(bound, 'prj-1', 'wp-1')).rejects.toThrow(
      /refused: invalid_input/,
    );
  });

  it('allows when the leaf has no mapped Ticket', async () => {
    const tx = chainSelect({
      wp: [{ isLeaf: true, deletedAt: null }],
      head: [],
    });
    const bound = { tx, tenantId: 'ten-1' } as unknown as Bound;
    await expect(assertMappedLeafMayBecomeSummary(bound, 'prj-1', 'wp-1')).resolves.toBeUndefined();
  });

  it('no-ops when the WP is already a summary', async () => {
    const tx = chainSelect({
      wp: [{ isLeaf: false, deletedAt: null }],
    });
    const bound = { tx, tenantId: 'ten-1' } as unknown as Bound;
    await expect(assertMappedLeafMayBecomeSummary(bound, 'prj-1', 'wp-1')).resolves.toBeUndefined();
  });

  it('no-ops when the WP is missing or soft-deleted', async () => {
    const missing = chainSelect({ wp: [] });
    await expect(
      assertMappedLeafMayBecomeSummary({ tx: missing, tenantId: 'ten-1' } as unknown as Bound, 'prj-1', 'wp-x'),
    ).resolves.toBeUndefined();

    const deleted = chainSelect({
      wp: [{ isLeaf: true, deletedAt: new Date('2026-10-06T12:00:00.000Z') }],
    });
    await expect(
      assertMappedLeafMayBecomeSummary({ tx: deleted, tenantId: 'ten-1' } as unknown as Bound, 'prj-1', 'wp-1'),
    ).resolves.toBeUndefined();
  });
});
