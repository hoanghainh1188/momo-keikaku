import { encode } from '@momo/domain';
import { eq, sql } from 'drizzle-orm';
import type { Db } from './client';
import { projectNotFound } from './project-not-found';
import * as s from './schema';
import { withTenant, type Tx } from './with-tenant';

/**
 * The five project writes — FR-29's four Dispositions and FR-21's manual Mapping — moved here
 * from `apps/web/src/app/actions.ts` by story 1.2 slice 4, bodies unchanged apart from taking
 * the Tenant and the actor as arguments.
 *
 * They satisfy `packages/app`'s `ProjectWritePort` STRUCTURALLY: this package may not import
 * `@momo/app` (the import direction), so the command types below restate the port's, and the
 * composition root's `satisfies ProjectWriteDeps<Db>` is where TypeScript checks the match. The
 * four Disposition commands carry their `kind` as a literal so that check can tell them apart
 * (see the port's header).
 *
 * AUDIT PAYLOADS GO THROUGH THE CODEC (AD-4): every `audit_log.payload` is written as
 * `encode(...)`, so a `bigint` in a later payload is stored as its decimal string instead of
 * throwing inside the driver, and a float is refused naming its path rather than stored lossily.
 *
 * EACH FUNCTION IS ONE `withTenant` TRANSACTION (AD-14): the event rows and the `audit_log` row
 * commit together or not at all. Every table touched carries FORCE row-level security, so the
 * inserts are only accepted inside `withTenant`, for the Tenant it set.
 *
 * AN INVISIBLE PROJECT REJECTS. Each write first reads its Project — the event time is the
 * Project's `demoAnchor` — and a Project the Tenant cannot see (it does not exist, or another
 * Tenant owns it) rejects through `projectNotFound`, the one helper `repo.ts` uses too,
 * which is what `packages/app`'s `isProjectNotFound` recognises. The rejection is inside the
 * transaction, so nothing is written. The demo spike's `new Date()` fallback is gone with it:
 * writing a Disposition against a Project that is not there was never a thing to do quietly.
 *
 * TODO(review-adversarial H1/H4): in production these appends must take the per-Project
 * advisory lock before allocating `seq`, and rule evaluation must re-read the Ticket's head
 * inside that lock (watermark discipline). The demo is single-user; not this slice's.
 */

export interface MapDispositionCommand {
  readonly kind: 'map';
  readonly projectId: string;
  readonly wpId: string;
  readonly ticketIds: readonly string[];
}

export interface PlanDispositionCommand {
  readonly kind: 'plan';
  readonly projectId: string;
  readonly name: string;
  readonly ticketIds: readonly string[];
}

export interface ExplainDispositionCommand {
  readonly kind: 'explain';
  readonly projectId: string;
  readonly note: string;
  readonly ticketIds: readonly string[];
}

export interface ChangeRequestCandidateCommand {
  readonly kind: 'cr_candidate';
  readonly projectId: string;
  readonly ticketIds: readonly string[];
}

/** `wpId` is the empty string for an unmap. */
export interface ManualMappingCommand {
  readonly projectId: string;
  readonly ticketId: string;
  readonly wpId: string;
}

type DispositionKind = 'map' | 'plan' | 'cr_candidate' | 'explain';

/** Who and when, fixed once per transaction and stamped on every row it writes. */
interface Stamp {
  readonly tenantId: string;
  readonly actor: string;
  readonly at: Date;
}

/**
 * The Project's anchor, which is the event time — or a rejection, for a Project this Tenant
 * cannot see, through the same helper as `repo.ts`'s bundle read (see the header).
 */
async function anchorOf(tx: Tx, projectId: string): Promise<Date> {
  const [p] = await tx.select().from(s.project).where(eq(s.project.id, projectId));
  if (!p) throw projectNotFound(projectId);
  return p.demoAnchor;
}

/**
 * The next `mapping_event.seq`, allocated by the database rather than derived from the rows
 * this Tenant can see.
 *
 * `mapping_event.seq` is a primary key unique across ALL Tenants, while the MAX row-level
 * security lets a caller see is its own Tenant's, so `SELECT MAX(seq) + 1` inside `withTenant`
 * would collide with another Tenant's events. `momo_next_mapping_event_seq()` is a SECURITY
 * DEFINER function generated from the table-class registry, so it reads the true maximum as
 * the table owner.
 *
 * Still not the watermark discipline — that takes `pg_advisory_xact_lock` before allocating,
 * and two concurrent writes can still read the same value here (see the TODO above).
 */
async function nextSeq(tx: Tx, table: 'mapping_event'): Promise<number> {
  const res = await tx.execute<{ next: string }>(
    sql.raw(`SELECT public.momo_next_${table}_seq() AS next`),
  );
  return Number(res.rows[0]?.next ?? 1);
}

async function appendMappings(
  tx: Tx,
  stamp: Stamp,
  projectId: string,
  ticketIds: readonly string[],
  wpId: string | null,
): Promise<void> {
  const first = await nextSeq(tx, 'mapping_event');
  await tx.insert(s.mappingEvent).values(
    ticketIds.map((ticketId, index) => ({
      seq: first + index,
      id: `map-${ticketId}-${stamp.at.getTime()}`,
      tenantId: stamp.tenantId,
      projectId,
      ticketId,
      wpId,
      // AD-9: Dispositions count as manual, so live rules never override them.
      source: 'disposition' as const,
      ruleId: null,
      at: stamp.at,
      actor: stamp.actor,
    })),
  );
}

async function recordDisposition(
  tx: Tx,
  stamp: Stamp,
  projectId: string,
  kind: DispositionKind,
  ticketIds: readonly string[],
  wpId: string | null,
  note: string | null,
): Promise<void> {
  await tx.insert(s.dispositionEvent).values({
    id: `disp-${kind}-${stamp.at.getTime()}`,
    tenantId: stamp.tenantId,
    projectId,
    kind,
    ticketIds: [...ticketIds],
    wpId,
    note,
    at: stamp.at,
    actor: stamp.actor,
  });
  await tx.insert(s.auditLog).values({
    tenantId: stamp.tenantId,
    actor: stamp.actor,
    action: `disposition.${kind}`,
    target: projectId,
    payload: encode({ ticketIds: [...ticketIds], wpId, note }),
    at: stamp.at,
  });
}

/** Opens the Tenant's transaction, reads the Project's anchor, and hands `work` the stamp. */
function inProject(
  db: Db,
  tenantId: string,
  actor: string,
  projectId: string,
  work: (tx: Tx, stamp: Stamp) => Promise<void>,
): Promise<void> {
  return withTenant(db, tenantId, async (tx) => {
    const at = await anchorOf(tx, projectId);
    await work(tx, { tenantId, actor, at });
  });
}

/** FR-29 *Map*. */
export function recordMapDisposition(
  db: Db,
  tenantId: string,
  actor: string,
  command: MapDispositionCommand,
): Promise<void> {
  const { kind, projectId, wpId, ticketIds } = command;
  return inProject(db, tenantId, actor, projectId, async (tx, stamp) => {
    await appendMappings(tx, stamp, projectId, ticketIds, wpId);
    await recordDisposition(tx, stamp, projectId, kind, ticketIds, wpId, null);
  });
}

/**
 * FR-29 *Plan*: a new leaf Work Package, `9.<n>` in the WBS where `n` counts the Project's
 * existing `9.` Work Packages, then the Mappings and the Disposition.
 *
 * The Work Package id is `wp-new-<anchor ms>`, as it always was — so a second Plan on the same
 * Project collides on `work_package`'s primary key while the demo clock is fixed. Recorded in
 * deferred-work; changing the id is not a rewiring.
 */
export function recordPlanDisposition(
  db: Db,
  tenantId: string,
  actor: string,
  command: PlanDispositionCommand,
): Promise<void> {
  const { kind, projectId, name, ticketIds } = command;
  return inProject(db, tenantId, actor, projectId, async (tx, stamp) => {
    const wpId = `wp-new-${stamp.at.getTime()}`;
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
      parentId: null,
      isLeaf: true,
      isMilestone: false,
      isCatchAll: false,
      start: null,
      finish: null,
      plannedMh: 0n,
      completedAt: null,
      milestoneDoneAt: null,
      assignedResourceIds: [],
      deletedAt: null,
    });
    await appendMappings(tx, stamp, projectId, ticketIds, wpId);
    await recordDisposition(tx, stamp, projectId, kind, ticketIds, wpId, null);
  });
}

/**
 * FR-29 *Explain*. The note is stored as given: `packages/app`'s `explainTickets` has already
 * refused one longer than `EXPLAIN_NOTE_MAX` (the web form parser cuts to that bound first).
 */
export function recordExplainDisposition(
  db: Db,
  tenantId: string,
  actor: string,
  command: ExplainDispositionCommand,
): Promise<void> {
  const { kind, projectId, note, ticketIds } = command;
  return inProject(db, tenantId, actor, projectId, (tx, stamp) =>
    recordDisposition(tx, stamp, projectId, kind, ticketIds, null, note),
  );
}

/** FR-29 *Change Request candidate*. */
export function recordChangeRequestCandidates(
  db: Db,
  tenantId: string,
  actor: string,
  command: ChangeRequestCandidateCommand,
): Promise<void> {
  const { kind, projectId, ticketIds } = command;
  return inProject(db, tenantId, actor, projectId, (tx, stamp) =>
    recordDisposition(tx, stamp, projectId, kind, ticketIds, null, null),
  );
}

/**
 * FR-21 manual Mapping of one Ticket. An empty `wpId` is an unmap: the event carries a null
 * Work Package and the audit action is `mapping.unmap` — while the audit payload keeps the
 * empty string it has always recorded.
 */
export function recordManualMapping(
  db: Db,
  tenantId: string,
  actor: string,
  command: ManualMappingCommand,
): Promise<void> {
  const { projectId, ticketId, wpId } = command;
  return inProject(db, tenantId, actor, projectId, async (tx, stamp) => {
    const seq = await nextSeq(tx, 'mapping_event');
    await tx.insert(s.mappingEvent).values({
      seq,
      id: `map-${ticketId}-${stamp.at.getTime()}`,
      tenantId,
      projectId,
      ticketId,
      wpId: wpId === '' ? null : wpId,
      source: 'manual',
      ruleId: null,
      at: stamp.at,
      actor,
    });
    await tx.insert(s.auditLog).values({
      tenantId,
      actor,
      action: wpId === '' ? 'mapping.unmap' : 'mapping.map',
      target: ticketId,
      payload: encode({ wpId }),
      at: stamp.at,
    });
  });
}
