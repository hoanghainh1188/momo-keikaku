'use server';

import { revalidatePath } from 'next/cache';
import { eq, sql } from 'drizzle-orm';
import { getDb, schema as s } from '@momo/db';

/**
 * FR-29 Dispositions. Every one of these is an explicit PM action, recorded as an
 * append-only event plus an audit row in the same transaction (AD-14).
 *
 * TODO(review-adversarial H1/H4): in production these appends must take the
 * per-Project advisory lock before allocating `seq`, and rule evaluation must
 * re-read the Ticket's head inside that lock. The demo is single-user.
 */

const TENANT = 'ten-momo';
const ACTOR = 'user:linh';

async function nextSeq(table: 'mapping_event'): Promise<number> {
  const db = getDb();
  const res = await db.execute<{ next: string }>(
    sql.raw(`SELECT COALESCE(MAX(seq), 0) + 1 AS next FROM ${table}`),
  );
  return Number(res.rows[0]?.next ?? 1);
}

async function appendMappings(
  projectId: string,
  ticketIds: string[],
  wpId: string | null,
  at: Date,
) {
  const db = getDb();
  let seq = await nextSeq('mapping_event');
  if (ticketIds.length === 0) return;
  await db.insert(s.mappingEvent).values(
    ticketIds.map((ticketId) => ({
      seq: seq++,
      id: `map-${ticketId}-${at.getTime()}`,
      tenantId: TENANT,
      projectId,
      ticketId,
      wpId,
      // AD-9: Dispositions count as manual, so live rules never override them.
      source: 'disposition' as const,
      ruleId: null,
      at,
      actor: ACTOR,
    })),
  );
}

async function recordDisposition(
  projectId: string,
  kind: 'map' | 'plan' | 'cr_candidate' | 'explain',
  ticketIds: string[],
  wpId: string | null,
  note: string | null,
  at: Date,
) {
  const db = getDb();
  await db.insert(s.dispositionEvent).values({
    id: `disp-${kind}-${at.getTime()}`,
    tenantId: TENANT,
    projectId,
    kind,
    ticketIds,
    wpId,
    note,
    at,
    actor: ACTOR,
  });
  await db.insert(s.auditLog).values({
    tenantId: TENANT,
    actor: ACTOR,
    action: `disposition.${kind}`,
    target: projectId,
    payload: { ticketIds, wpId, note },
    at,
  });
}

async function anchorOf(projectId: string): Promise<Date> {
  const db = getDb();
  const [p] = await db.select().from(s.project).where(eq(s.project.id, projectId));
  // The demo spike's fallback when a project has no anchor row. The correct end state is
  // a `Clock` injected at the composition root — but `apps/web` has no composition root
  // yet, and this whole file is one of the eight that story 1.2 moves onto use cases. The
  // disable is one line wide and says who removes it.
  // eslint-disable-next-line no-restricted-syntax -- no Clock to inject until story 1.2
  return p ? p.demoAnchor : new Date();
}

/** FR-29 *Map*: the hours leave Unplanned Work immediately (FR-21 attribution). */
export async function mapTickets(formData: FormData): Promise<void> {
  const projectId = String(formData.get('projectId'));
  const wpId = String(formData.get('wpId'));
  const ticketIds = String(formData.get('ticketIds')).split(',').filter(Boolean);
  if (!wpId || ticketIds.length === 0) return;
  const at = await anchorOf(projectId);
  await appendMappings(projectId, ticketIds, wpId, at);
  await recordDisposition(projectId, 'map', ticketIds, wpId, null, at);
  revalidatePath(`/p/${projectId}/review`);
  revalidatePath(`/p/${projectId}/mapping`);
}

/**
 * FR-29 *Plan*: creates a Work Package in the Current Plan and maps the Tickets to
 * it. Its hours stay Unplanned Work until a Re-baseline includes the WP.
 */
export async function planTickets(formData: FormData): Promise<void> {
  const projectId = String(formData.get('projectId'));
  const name = String(formData.get('name') ?? '').trim();
  const ticketIds = String(formData.get('ticketIds')).split(',').filter(Boolean);
  if (!name || ticketIds.length === 0) return;
  const db = getDb();
  const at = await anchorOf(projectId);
  const wpId = `wp-new-${at.getTime()}`;
  const existing = await db.select().from(s.workPackage).where(eq(s.workPackage.projectId, projectId));
  const nextIndex =
    existing.filter((w) => w.wbsCode.startsWith('9.')).length + 1;

  await db.insert(s.workPackage).values({
    id: wpId,
    tenantId: TENANT,
    projectId,
    wbsCode: `9.${nextIndex}`,
    name,
    parentId: null,
    isLeaf: true,
    isMilestone: false,
    isCatchAll: false,
    start: null,
    finish: null,
    plannedMh: 0,
    completedAt: null,
    milestoneDoneAt: null,
    assignedResourceIds: [],
    deletedAt: null,
  });
  await appendMappings(projectId, ticketIds, wpId, at);
  await recordDisposition(projectId, 'plan', ticketIds, wpId, null, at);
  revalidatePath(`/p/${projectId}/review`);
  revalidatePath(`/p/${projectId}/plan`);
}

/** FR-29 *Explain*: attaches a note. Clients see it only if a snapshot is published. */
export async function explainTickets(formData: FormData): Promise<void> {
  const projectId = String(formData.get('projectId'));
  const note = String(formData.get('note') ?? '').trim();
  const ticketIds = String(formData.get('ticketIds')).split(',').filter(Boolean);
  if (!note || ticketIds.length === 0) return;
  const at = await anchorOf(projectId);
  await recordDisposition(projectId, 'explain', ticketIds, null, note.slice(0, 1000), at);
  revalidatePath(`/p/${projectId}/review`);
  revalidatePath(`/c/${projectId}`);
}

/** FR-29 *Change Request candidate*: collects the Tickets into a list. */
export async function crCandidate(formData: FormData): Promise<void> {
  const projectId = String(formData.get('projectId'));
  const ticketIds = String(formData.get('ticketIds')).split(',').filter(Boolean);
  if (ticketIds.length === 0) return;
  const at = await anchorOf(projectId);
  await recordDisposition(projectId, 'cr_candidate', ticketIds, null, null, at);
  revalidatePath(`/p/${projectId}/review`);
}

/** Map a single Ticket from the Mapping surface (FR-21 manual Mapping). */
export async function mapSingleTicket(formData: FormData): Promise<void> {
  const projectId = String(formData.get('projectId'));
  const ticketId = String(formData.get('ticketId'));
  const wpId = String(formData.get('wpId'));
  if (!ticketId) return;
  const at = await anchorOf(projectId);
  const db = getDb();
  let seq = await nextSeq('mapping_event');
  await db.insert(s.mappingEvent).values({
    seq,
    id: `map-${ticketId}-${at.getTime()}`,
    tenantId: TENANT,
    projectId,
    ticketId,
    wpId: wpId === '' ? null : wpId,
    source: 'manual',
    ruleId: null,
    at,
    actor: ACTOR,
  });
  await db.insert(s.auditLog).values({
    tenantId: TENANT,
    actor: ACTOR,
    action: wpId === '' ? 'mapping.unmap' : 'mapping.map',
    target: ticketId,
    payload: { wpId },
    at,
  });
  revalidatePath(`/p/${projectId}/mapping`);
  revalidatePath(`/p/${projectId}/review`);
}
