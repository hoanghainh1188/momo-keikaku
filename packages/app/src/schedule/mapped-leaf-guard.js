/**
 * Story 5.9 / FR-21 / AR-18: refuse plan edits that would turn a mapped leaf into a summary
 * until its Mappings are reassigned. Shared with Epic 3 `confirmImport` (wire deferred).
 */
import { and, eq, isNull } from 'drizzle-orm';
import * as s from '../../../db/src/schema';
import { refuse } from '../use-cases/audited-write';
/**
 * If `wpId` is a live leaf with any Ticket currently mapped to it (via derived `mapping_head`),
 * or a live Mapping Rule targeting it (story 5.10), refuse — the caller must reassign mappings
 * (or retarget / delete the rule) first. No-op when the WP is missing, deleted, or
 * already a summary.
 */
export async function assertMappedLeafMayBecomeSummary(bound, projectId, wpId) {
    const { tx, tenantId } = bound;
    const [wp] = await tx
        .select({
        isLeaf: s.workPackage.isLeaf,
        deletedAt: s.workPackage.deletedAt,
    })
        .from(s.workPackage)
        .where(and(eq(s.workPackage.tenantId, tenantId), eq(s.workPackage.projectId, projectId), eq(s.workPackage.id, wpId)));
    if (wp === undefined || wp.deletedAt !== null || !wp.isLeaf)
        return;
    const [mapped] = await tx
        .select({ ticketId: s.mappingHead.ticketId })
        .from(s.mappingHead)
        .where(and(eq(s.mappingHead.tenantId, tenantId), eq(s.mappingHead.projectId, projectId), eq(s.mappingHead.wpId, wpId)))
        .limit(1);
    if (mapped !== undefined) {
        refuse('invalid_input', { wpId: ['mapped_leaf'] });
    }
    // Story 5.10: a live Mapping Rule's target must stay a leaf too — rules never target a summary.
    const [ruleTarget] = await tx
        .select({ id: s.mappingRule.id })
        .from(s.mappingRule)
        .where(and(eq(s.mappingRule.tenantId, tenantId), eq(s.mappingRule.projectId, projectId), eq(s.mappingRule.wpId, wpId), isNull(s.mappingRule.deletedAt)))
        .limit(1);
    if (ruleTarget !== undefined) {
        refuse('invalid_input', { wpId: ['rule_target_leaf'] });
    }
}
