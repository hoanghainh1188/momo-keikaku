/**
 * First-observed activity for a Work Package (story 2.10, Q4 → A / UX-DR13).
 *
 * Returns the calendar date of the earliest ledger entry among Tickets currently mapped to
 * the WP — display-only evidence for the complete flow. Never writes an actual date.
 */
import { and, asc, eq, inArray } from 'drizzle-orm';
import { mappingHead, projectDate } from '@momo/domain';
import type { Bound } from '../../../db/src/bound';
import { projectNotFound } from '../../../db/src/project-not-found';
import * as s from '../../../db/src/schema';

export async function readFirstObservedActivity(
  bound: Bound,
  projectId: string,
  wpId: string,
): Promise<string | null> {
  const { tx, tenantId } = bound;

  const [project] = await tx
    .select({ tzOffsetMinutes: s.project.tzOffsetMinutes })
    .from(s.project)
    .where(and(eq(s.project.tenantId, tenantId), eq(s.project.id, projectId)));
  if (!project) throw projectNotFound(projectId);

  const mapRows = await tx
    .select({
      seq: s.mappingEvent.seq,
      ticketId: s.mappingEvent.ticketId,
      wpId: s.mappingEvent.wpId,
      source: s.mappingEvent.source,
      at: s.mappingEvent.at,
      actor: s.mappingEvent.actor,
      ruleId: s.mappingEvent.ruleId,
    })
    .from(s.mappingEvent)
    .where(and(eq(s.mappingEvent.tenantId, tenantId), eq(s.mappingEvent.projectId, projectId)))
    .orderBy(asc(s.mappingEvent.seq));

  const head = mappingHead(
    mapRows.map((m) => ({
      seq: m.seq,
      ticketId: m.ticketId,
      wpId: m.wpId,
      source: m.source as 'manual' | 'rule' | 'disposition',
      at: m.at.toISOString(),
      actor: m.actor,
      ruleId: m.ruleId,
    })),
  );

  const ticketIds = [...head.entries()]
    .filter(([, entry]) => entry.wpId === wpId)
    .map(([ticketId]) => ticketId);
  if (ticketIds.length === 0) return null;

  const ledger = await tx
    .select({
      windowStart: s.actualsLedgerEntry.windowStart,
      windowEnd: s.actualsLedgerEntry.windowEnd,
    })
    .from(s.actualsLedgerEntry)
    .where(
      and(
        eq(s.actualsLedgerEntry.tenantId, tenantId),
        inArray(s.actualsLedgerEntry.ticketId, ticketIds),
      ),
    );

  let earliest: string | null = null;
  for (const row of ledger) {
    const instant = row.windowStart ?? row.windowEnd;
    const day = projectDate(instant.toISOString(), project.tzOffsetMinutes);
    if (earliest === null || day < earliest) earliest = day;
  }
  return earliest;
}
