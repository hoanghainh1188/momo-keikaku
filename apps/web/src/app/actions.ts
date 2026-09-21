'use server';

import { revalidatePath } from 'next/cache';
import { eq, sql } from 'drizzle-orm';
import { schema as s, withTenant, type Tx } from '@momo/db';
// Out of scope for story 1.2 slice 3, which moved only the seven READ call sites: these five
// write actions still reach `@momo/db` and Drizzle directly, and are the next slice's — which
// is why the dependency-cruiser gate waits for it. Only this import's path changed here.
import { webDb, WEB_TENANT_ID } from '@/server/composition';

/**
 * FR-29 Dispositions. Every one of these is an explicit PM action, recorded as an
 * append-only event plus an audit row in the same transaction (AD-14).
 *
 * TODO(review-adversarial H1/H4): in production these appends must take the
 * per-Project advisory lock before allocating `seq`, and rule evaluation must
 * re-read the Ticket's head inside that lock. The demo is single-user.
 */

const TENANT = WEB_TENANT_ID;
const ACTOR = 'user:linh';

/**
 * Every action below now runs inside `withTenant`, on the `tx` handle.
 *
 * That is not cosmetic. `apps/web` connects as the restricted `momo_app` role from this
 * story on, and every table these actions touch carries FORCE row-level security with a
 * policy on `app.tenant_id`: outside `withTenant` the reads return nothing and the inserts
 * are rejected by the policy's WITH CHECK. One transaction per action is also what AD-14
 * asks for — the event and its audit row commit together or not at all.
 *
 * `run` is the seam that keeps the per-action bodies unchanged apart from taking `tx`.
 */
function run<T>(work: (tx: Tx) => Promise<T>): Promise<T> {
  return withTenant(webDb(), TENANT, work);
}

/**
 * The next `mapping_event.seq`, allocated by the database rather than derived from the rows
 * this Tenant can see.
 *
 * It used to be `SELECT COALESCE(MAX(seq), 0) + 1 FROM mapping_event`, and moving that inside
 * `withTenant` made it wrong: `mapping_event.seq` is a primary key unique across ALL Tenants,
 * while the MAX row-level security lets a caller see is its own Tenant's. A second Tenant
 * would compute 1 and collide with the seeded events. `momo_next_mapping_event_seq()` is a
 * SECURITY DEFINER function generated from the table-class registry, so it reads the true
 * maximum as the table owner.
 *
 * Still not the watermark discipline the architecture asks for — that takes
 * `pg_advisory_xact_lock` before allocating, and belongs to the slice that owns it. Two
 * concurrent actions can still read the same value here. This stops the cross-tenant
 * collision, which is a different and currently live bug.
 */
async function nextSeq(tx: Tx, table: 'mapping_event'): Promise<number> {
  const res = await tx.execute<{ next: string }>(
    sql.raw(`SELECT public.momo_next_${table}_seq() AS next`),
  );
  return Number(res.rows[0]?.next ?? 1);
}

async function appendMappings(
  tx: Tx,
  projectId: string,
  ticketIds: string[],
  wpId: string | null,
  at: Date,
) {
  if (ticketIds.length === 0) return;
  let seq = await nextSeq(tx, 'mapping_event');
  await tx.insert(s.mappingEvent).values(
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
  tx: Tx,
  projectId: string,
  kind: 'map' | 'plan' | 'cr_candidate' | 'explain',
  ticketIds: string[],
  wpId: string | null,
  note: string | null,
  at: Date,
) {
  await tx.insert(s.dispositionEvent).values({
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
  await tx.insert(s.auditLog).values({
    tenantId: TENANT,
    actor: ACTOR,
    action: `disposition.${kind}`,
    target: projectId,
    payload: { ticketIds, wpId, note },
    at,
  });
}

async function anchorOf(tx: Tx, projectId: string): Promise<Date> {
  const [p] = await tx.select().from(s.project).where(eq(s.project.id, projectId));
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
  await run(async (tx) => {
    const at = await anchorOf(tx, projectId);
    await appendMappings(tx, projectId, ticketIds, wpId, at);
    await recordDisposition(tx, projectId, 'map', ticketIds, wpId, null, at);
  });
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
  await run(async (tx) => {
    const at = await anchorOf(tx, projectId);
    const wpId = `wp-new-${at.getTime()}`;
    const existing = await tx.select().from(s.workPackage).where(eq(s.workPackage.projectId, projectId));
    const nextIndex =
      existing.filter((w) => w.wbsCode.startsWith('9.')).length + 1;

    await tx.insert(s.workPackage).values({
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
    await appendMappings(tx, projectId, ticketIds, wpId, at);
    await recordDisposition(tx, projectId, 'plan', ticketIds, wpId, null, at);
  });
  revalidatePath(`/p/${projectId}/review`);
  revalidatePath(`/p/${projectId}/plan`);
}

/** FR-29 *Explain*: attaches a note. Clients see it only if a snapshot is published. */
export async function explainTickets(formData: FormData): Promise<void> {
  const projectId = String(formData.get('projectId'));
  const note = String(formData.get('note') ?? '').trim();
  const ticketIds = String(formData.get('ticketIds')).split(',').filter(Boolean);
  if (!note || ticketIds.length === 0) return;
  await run(async (tx) => {
    const at = await anchorOf(tx, projectId);
    await recordDisposition(tx, projectId, 'explain', ticketIds, null, note.slice(0, 1000), at);
  });
  revalidatePath(`/p/${projectId}/review`);
  revalidatePath(`/c/${projectId}`);
}

/** FR-29 *Change Request candidate*: collects the Tickets into a list. */
export async function crCandidate(formData: FormData): Promise<void> {
  const projectId = String(formData.get('projectId'));
  const ticketIds = String(formData.get('ticketIds')).split(',').filter(Boolean);
  if (ticketIds.length === 0) return;
  await run(async (tx) => {
    const at = await anchorOf(tx, projectId);
    await recordDisposition(tx, projectId, 'cr_candidate', ticketIds, null, null, at);
  });
  revalidatePath(`/p/${projectId}/review`);
}

/** Map a single Ticket from the Mapping surface (FR-21 manual Mapping). */
export async function mapSingleTicket(formData: FormData): Promise<void> {
  const projectId = String(formData.get('projectId'));
  const ticketId = String(formData.get('ticketId'));
  const wpId = String(formData.get('wpId'));
  if (!ticketId) return;
  await run(async (tx) => {
    const at = await anchorOf(tx, projectId);
    const seq = await nextSeq(tx, 'mapping_event');
    await tx.insert(s.mappingEvent).values({
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
    await tx.insert(s.auditLog).values({
      tenantId: TENANT,
      actor: ACTOR,
      action: wpId === '' ? 'mapping.unmap' : 'mapping.map',
      target: ticketId,
      payload: { wpId },
      at,
    });
  });
  revalidatePath(`/p/${projectId}/mapping`);
  revalidatePath(`/p/${projectId}/review`);
}
