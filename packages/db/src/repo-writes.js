import { and, eq, isNull, sql } from 'drizzle-orm';
import { projectNotFound } from './project-not-found';
import * as s from './schema';
import { lockWatermark } from './watermark-lock';
/**
 * The Project's anchor, which is the event time — or a rejection, for a Project this Tenant
 * cannot see, through the same helper as `repo.ts`'s bundle read (see the header).
 */
async function anchorOf(tx, projectId) {
    const [p] = await tx.select().from(s.project).where(eq(s.project.id, projectId));
    if (!p)
        throw projectNotFound(projectId);
    return p.demoAnchor;
}
/** Dual-write one Mapping head row (derived; never SoT). */
export async function upsertMappingHead(bound, row) {
    await bound.tx
        .insert(s.mappingHead)
        .values(row)
        .onConflictDoUpdate({
        target: [s.mappingHead.tenantId, s.mappingHead.projectId, s.mappingHead.ticketId],
        set: {
            wpId: row.wpId,
            source: row.source,
            ruleId: row.ruleId,
            seq: row.seq,
            at: row.at,
            actor: row.actor,
        },
    });
}
/**
 * Append Mapping events and dual-write `mapping_head` for each. Callers hold (or take) the
 * Project watermark lock before the first append.
 */
export async function appendMappingEvents(bound, stamp, projectId, rows) {
    if (rows.length === 0)
        return;
    const { tx, tenantId } = bound;
    await lockWatermark(bound, { kind: 'project', projectId });
    const inserted = await tx
        .insert(s.mappingEvent)
        .values(rows.map((r) => ({
        id: r.id ?? `map-${r.ticketId}-${stamp.at.getTime()}`,
        tenantId,
        projectId,
        ticketId: r.ticketId,
        wpId: r.wpId,
        source: r.source,
        ruleId: r.ruleId ?? null,
        at: stamp.at,
        actor: stamp.actor,
    })))
        .returning({
        seq: s.mappingEvent.seq,
        ticketId: s.mappingEvent.ticketId,
        wpId: s.mappingEvent.wpId,
        source: s.mappingEvent.source,
        ruleId: s.mappingEvent.ruleId,
        at: s.mappingEvent.at,
        actor: s.mappingEvent.actor,
    });
    for (const row of inserted) {
        await upsertMappingHead(bound, {
            tenantId,
            projectId,
            ticketId: row.ticketId,
            wpId: row.wpId,
            source: row.source,
            ruleId: row.ruleId,
            seq: row.seq,
            at: row.at,
            actor: row.actor,
        });
    }
}
async function appendMappings(bound, stamp, projectId, ticketIds, wpId) {
    await appendMappingEvents(bound, stamp, projectId, ticketIds.map((ticketId) => ({
        ticketId,
        wpId,
        // AD-9: Dispositions count as manual, so live rules never override them.
        source: 'disposition',
    })));
}
/** The Disposition event. Its audit record is the use case's, through the audit sink. */
async function recordDisposition({ tx, tenantId }, stamp, projectId, kind, ticketIds, wpId, note) {
    await lockWatermark({ tx, tenantId }, { kind: 'project', projectId });
    await tx.insert(s.dispositionEvent).values({
        id: `disp-${kind}-${stamp.at.getTime()}`,
        tenantId,
        projectId,
        kind,
        ticketIds: [...ticketIds],
        wpId,
        note,
        at: stamp.at,
        actor: stamp.actor,
    });
}
/** FR-29 *Map*. */
function recordMapDisposition(bound) {
    return async (stamp, command) => {
        const { kind, projectId, wpId, ticketIds } = command;
        await appendMappings(bound, stamp, projectId, ticketIds, wpId);
        await recordDisposition(bound, stamp, projectId, kind, ticketIds, wpId, null);
    };
}
/**
 * FR-29 *Plan*: a new leaf Work Package, `9.<n>` in the WBS where `n` counts the Project's
 * existing `9.` Work Packages, then the Mappings and the Disposition. Returns the new Work
 * Package's id, which the use case's audit payload records.
 *
 * The id arrives in the command, issued by the app layer from the `IdGenerator` port. It used to
 * be built here as `wp-new-<anchor ms>`, which collided whenever a Project was planned twice —
 * and, because `work_package.id` is a GLOBAL primary key, whenever two Tenants planned at the
 * same anchor, which in the demo is every Tenant. Epic 1 retrospective, audit finding A1.
 */
function recordPlanDisposition(bound) {
    return async (stamp, command) => {
        const { tx, tenantId } = bound;
        const { kind, projectId, name, ticketIds, wpId } = command;
        const existing = await tx
            .select()
            .from(s.workPackage)
            .where(eq(s.workPackage.projectId, projectId));
        const nextIndex = existing.filter((w) => w.wbsCode.startsWith('9.')).length + 1;
        await tx.insert(s.workPackage).values({
            id: wpId,
            tenantId,
            projectId,
            wbsCode: `9.${nextIndex}`,
            name,
            // A leaf: `child_count` defaults to 0, so the generated `is_leaf` is true (AD-25). No
            // duration and no constraint — the new Work Package is "not schedulable yet".
            parentId: null,
            isMilestone: false,
            isCatchAll: false,
            plannedMh: 0n,
            assignedResourceIds: [],
            deletedAt: null,
        });
        await appendMappings(bound, stamp, projectId, ticketIds, wpId);
        await recordDisposition(bound, stamp, projectId, kind, ticketIds, wpId, null);
        return { wpId };
    };
}
/**
 * FR-29 *Explain*. The note is stored as given: `packages/app`'s `explainTickets` has already
 * refused one longer than `EXPLAIN_NOTE_MAX` (the web form parser cuts to that bound first).
 */
function recordExplainDisposition(bound) {
    return (stamp, command) => {
        const { kind, projectId, note, ticketIds } = command;
        return recordDisposition(bound, stamp, projectId, kind, ticketIds, null, note);
    };
}
/** FR-29 *Change Request candidate*. */
function recordChangeRequestCandidates(bound) {
    return (stamp, command) => {
        const { kind, projectId, ticketIds } = command;
        return recordDisposition(bound, stamp, projectId, kind, ticketIds, null, null);
    };
}
/**
 * FR-21 manual Mapping of one Ticket. An empty `wpId` is an ordinary unmap: `source = release`,
 * `wp_id = null` (back to rules — not pinned Unmapped). Story 5.9 / A4.
 */
function recordManualMapping(bound) {
    return async (stamp, command) => {
        const { projectId, ticketId, wpId } = command;
        const release = wpId === '';
        await appendMappingEvents(bound, stamp, projectId, [
            {
                ticketId,
                wpId: release ? null : wpId,
                source: release ? 'release' : 'manual',
            },
        ]);
    };
}
/**
 * Whether `wpId` is a mappable Work Package of `projectId` (AD-12 + FR-21 leaf-only): live,
 * leaf, non-milestone. The use case asks before it writes a Mapping or a Disposition naming the
 * Work Package, and refuses `not_found` on `false`.
 */
function workPackageInProject({ tx }) {
    return async (projectId, wpId) => {
        const rows = await tx
            .select({ id: s.workPackage.id })
            .from(s.workPackage)
            .where(and(eq(s.workPackage.id, wpId), eq(s.workPackage.projectId, projectId), eq(s.workPackage.isLeaf, true), eq(s.workPackage.isMilestone, false), isNull(s.workPackage.deletedAt)))
            .limit(1);
        return rows.length > 0;
    };
}
/**
 * Whether `ticketId` (tracker issue id) is a Ticket of `projectId` (story 5.9 / AR-18).
 */
function ticketInProject({ tx, tenantId }) {
    return async (projectId, ticketId) => {
        const rows = await tx
            .select({ id: s.ticket.id })
            .from(s.ticket)
            .where(and(eq(s.ticket.tenantId, tenantId), eq(s.ticket.projectId, projectId), eq(s.ticket.trackerIssueId, ticketId)))
            .limit(1);
        return rows.length > 0;
    };
}
/**
 * Story 5.9 / AR-18: release every Ticket currently mapped to `wpId` (`source = release`).
 * Call under the Project watermark lock (idempotent if already held).
 */
export async function reassignMappingsFromWp(bound, stamp, projectId, wpId) {
    const { tx, tenantId } = bound;
    // Lock before reading heads so concurrent maps cannot land after the select and remain mapped
    // through soft-delete. appendMappingEvents re-locks idempotently.
    await lockWatermark(bound, { kind: 'project', projectId });
    const heads = await tx
        .select({ ticketId: s.mappingHead.ticketId })
        .from(s.mappingHead)
        .where(and(eq(s.mappingHead.tenantId, tenantId), eq(s.mappingHead.projectId, projectId), eq(s.mappingHead.wpId, wpId)));
    if (heads.length === 0)
        return;
    await appendMappingEvents(bound, stamp, projectId, heads.map((h) => ({
        ticketId: h.ticketId,
        wpId: null,
        source: 'release',
        id: `map-release-${h.ticketId}-${stamp.at.getTime()}`,
    })));
}
/**
 * Story 5.9 / AR-18 / FR-5: retire the `mapping_rule` rows targeting `wpId` so a deleted WP
 * cannot remain a live rule target. Story 5.10 makes it a SOFT delete (`deleted_at`): the rule
 * never evaluates again, and the `mapping_event.rule_id` rows it produced still resolve.
 */
export async function disableRulesTargeting(bound, projectId, wpId, at) {
    const { tx, tenantId } = bound;
    await tx
        .update(s.mappingRule)
        .set({ deletedAt: at })
        .where(and(eq(s.mappingRule.tenantId, tenantId), eq(s.mappingRule.projectId, projectId), eq(s.mappingRule.wpId, wpId), isNull(s.mappingRule.deletedAt)));
}
/** Rebuild `mapping_head` for one Project from events (seed / maintenance). */
export async function rebuildMappingHeadForProject(bound, projectId) {
    const { tx, tenantId } = bound;
    await tx
        .delete(s.mappingHead)
        .where(and(eq(s.mappingHead.tenantId, tenantId), eq(s.mappingHead.projectId, projectId)));
    // DISTINCT ON latest seq per ticket — same semantics as domain `mappingHead`.
    await tx.execute(sql `
    INSERT INTO mapping_head (tenant_id, project_id, ticket_id, wp_id, source, rule_id, seq, at, actor)
    SELECT DISTINCT ON (tenant_id, project_id, ticket_id)
      tenant_id, project_id, ticket_id, wp_id, source, rule_id, seq, at, actor
    FROM mapping_event
    WHERE tenant_id = ${tenantId} AND project_id = ${projectId}
    ORDER BY tenant_id, project_id, ticket_id, seq DESC
  `);
}
/** The project write repository, bound to one transaction and its Tenant. */
export function projectWriteRepositoryOn(bound) {
    return {
        projectAnchor: (projectId) => anchorOf(bound.tx, projectId),
        workPackageInProject: workPackageInProject(bound),
        ticketInProject: ticketInProject(bound),
        recordMapDisposition: recordMapDisposition(bound),
        recordPlanDisposition: recordPlanDisposition(bound),
        recordExplainDisposition: recordExplainDisposition(bound),
        recordChangeRequestCandidates: recordChangeRequestCandidates(bound),
        recordManualMapping: recordManualMapping(bound),
        reassignMappingsFromWp: (stamp, projectId, wpId) => reassignMappingsFromWp(bound, stamp, projectId, wpId),
        disableRulesTargeting: (projectId, wpId, at) => disableRulesTargeting(bound, projectId, wpId, at),
    };
}
