/**
 * Story 5.9 / FR-21 / AR-18: refuse plan edits that would turn a mapped leaf into a summary
 * until its Mappings are reassigned. Shared with Epic 3 `confirmImport` (wire deferred).
 */
import { and, eq } from 'drizzle-orm';
import type { Bound } from '../../../db/src/bound';
import * as s from '../../../db/src/schema';
import { refuse } from '../use-cases/audited-write';

/**
 * If `wpId` is a live leaf with any Ticket currently mapped to it (via derived `mapping_head`),
 * refuse — the caller must reassign mappings first. No-op when the WP is missing, deleted, or
 * already a summary.
 */
export async function assertMappedLeafMayBecomeSummary(
  bound: Bound,
  projectId: string,
  wpId: string,
): Promise<void> {
  const { tx, tenantId } = bound;
  const [wp] = await tx
    .select({
      isLeaf: s.workPackage.isLeaf,
      deletedAt: s.workPackage.deletedAt,
    })
    .from(s.workPackage)
    .where(
      and(
        eq(s.workPackage.tenantId, tenantId),
        eq(s.workPackage.projectId, projectId),
        eq(s.workPackage.id, wpId),
      ),
    );
  if (wp === undefined || wp.deletedAt !== null || !wp.isLeaf) return;

  const [mapped] = await tx
    .select({ ticketId: s.mappingHead.ticketId })
    .from(s.mappingHead)
    .where(
      and(
        eq(s.mappingHead.tenantId, tenantId),
        eq(s.mappingHead.projectId, projectId),
        eq(s.mappingHead.wpId, wpId),
      ),
    )
    .limit(1);

  if (mapped !== undefined) {
    refuse('invalid_input', { wpId: ['mapped_leaf'] });
  }
}
