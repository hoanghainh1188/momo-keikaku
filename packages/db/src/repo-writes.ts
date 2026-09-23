import { and, eq } from 'drizzle-orm';
import type { Bound } from './bound';
import { projectNotFound } from './project-not-found';
import * as s from './schema';
import { lockWatermark } from './watermark-lock';
import type { Tx } from './with-tenant';

/**
 * The five project writes — FR-29's four Dispositions and FR-21's manual Mapping.
 *
 * Moved here from `apps/web/src/app/actions.ts` by story 1.2 slice 4; reshaped by story 1.3
 * slice 1 onto `packages/app`'s tenant-transaction port. `inTenantTransaction`
 * (`tenant-transaction.ts` since slice 2, which generalised it) opens ONE `withTenant` transaction
 * and hands the use case a scope whose every member is bound to it: the project write repository
 * below, the organisation repository (`repo-org.ts`) and the audit sink (`audit-sink.ts`). The
 * use case makes its change through a repository and records it through the sink, so both commit
 * together or not at all (AD-14). The repository no longer writes `audit_log` — the sink is its one writer, and
 * `packages/app`'s `audit.record` the one caller — and the event inserts stay here.
 *
 * They satisfy `packages/app`'s `ProjectWriteDeps` STRUCTURALLY: this package may not import
 * `@momo/app` (the import direction), so the command types below restate the port's, and each
 * composition root's `satisfies ProjectWriteDeps<Db>` is where TypeScript checks the match. The
 * four Disposition commands carry their `kind` as a literal so that check can tell them apart
 * (see the port's header).
 *
 * NO MEMBER OPENS A TRANSACTION. Every statement is issued on the scope's `tx`; a member calling
 * `withTenant` itself would open a second, independent transaction on another pooled connection
 * (deferred-work: `withTenant` is not re-entrant), whose rows would survive this one's rollback.
 *
 * AN INVISIBLE PROJECT REJECTS. The use case first asks `projectAnchor` — the event time is the
 * Project's `demoAnchor` — and a Project the Tenant cannot see (it does not exist, or another
 * Tenant owns it) rejects through `projectNotFound`, the one helper `repo.ts` uses too, which is
 * what `packages/app`'s `isProjectNotFound` recognises. The rejection is inside the transaction,
 * so nothing is written.
 *
 * EVERY APPEND TAKES THE PROJECT'S WATERMARK LOCK FIRST (story 1.2 watermark slice, D2):
 * `mapping_event` and `disposition_event` are append-only and read at a watermark, so each insert
 * below is preceded by `lockWatermark(bound, { kind: 'project', projectId })`, and `seq` comes
 * from the identity default the INSERT evaluates after the lock. `watermark-lock.ts` has why.
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
  /** Issued by the app layer from the `IdGenerator` port — see `recordPlanDisposition`. */
  readonly wpId: string;
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

/**
 * Who and when, stamped on every row one write lands — `packages/app`'s `WriteStamp`, restated.
 * The Tenant is not in it: the repository is bound to its transaction's Tenant.
 */
export interface WriteStamp {
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

async function appendMappings(
  { tx, tenantId }: Bound,
  stamp: WriteStamp,
  projectId: string,
  ticketIds: readonly string[],
  wpId: string | null,
): Promise<void> {
  await lockWatermark({ tx, tenantId }, { kind: 'project', projectId });
  await tx.insert(s.mappingEvent).values(
    ticketIds.map((ticketId) => ({
      id: `map-${ticketId}-${stamp.at.getTime()}`,
      tenantId,
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

/** The Disposition event. Its audit record is the use case's, through the audit sink. */
async function recordDisposition(
  { tx, tenantId }: Bound,
  stamp: WriteStamp,
  projectId: string,
  kind: DispositionKind,
  ticketIds: readonly string[],
  wpId: string | null,
  note: string | null,
): Promise<void> {
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
function recordMapDisposition(bound: Bound) {
  return async (stamp: WriteStamp, command: MapDispositionCommand): Promise<void> => {
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
function recordPlanDisposition(bound: Bound) {
  return async (
    stamp: WriteStamp,
    command: PlanDispositionCommand,
  ): Promise<{ readonly wpId: string }> => {
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
function recordExplainDisposition(bound: Bound) {
  return (stamp: WriteStamp, command: ExplainDispositionCommand): Promise<void> => {
    const { kind, projectId, note, ticketIds } = command;
    return recordDisposition(bound, stamp, projectId, kind, ticketIds, null, note);
  };
}

/** FR-29 *Change Request candidate*. */
function recordChangeRequestCandidates(bound: Bound) {
  return (stamp: WriteStamp, command: ChangeRequestCandidateCommand): Promise<void> => {
    const { kind, projectId, ticketIds } = command;
    return recordDisposition(bound, stamp, projectId, kind, ticketIds, null, null);
  };
}

/**
 * FR-21 manual Mapping of one Ticket. An empty `wpId` is an unmap: the event carries a null
 * Work Package (the use case records it as `mapping.unmap`, keeping the empty string in the
 * payload as it always has).
 */
function recordManualMapping(bound: Bound) {
  return async (stamp: WriteStamp, command: ManualMappingCommand): Promise<void> => {
    const { tx, tenantId } = bound;
    const { projectId, ticketId, wpId } = command;
    await lockWatermark(bound, { kind: 'project', projectId });
    await tx.insert(s.mappingEvent).values({
      id: `map-${ticketId}-${stamp.at.getTime()}`,
      tenantId,
      projectId,
      ticketId,
      wpId: wpId === '' ? null : wpId,
      source: 'manual',
      ruleId: null,
      at: stamp.at,
      actor: stamp.actor,
    });
  };
}

/**
 * Whether `wpId` is a Work Package of `projectId` (AD-12). The use case asks before it writes a
 * Mapping or a Disposition naming the Work Package, and refuses `not_found` on `false` — so a PM
 * who reaches one Project cannot append rows in it that name another Project's Work Package.
 */
function workPackageInProject({ tx }: Bound) {
  return async (projectId: string, wpId: string): Promise<boolean> => {
    const rows = await tx
      .select({ id: s.workPackage.id })
      .from(s.workPackage)
      .where(and(eq(s.workPackage.id, wpId), eq(s.workPackage.projectId, projectId)))
      .limit(1);
    return rows.length > 0;
  };
}

/** The project write repository, bound to one transaction and its Tenant. */
export function projectWriteRepositoryOn(bound: Bound) {
  return {
    projectAnchor: (projectId: string) => anchorOf(bound.tx, projectId),
    workPackageInProject: workPackageInProject(bound),
    recordMapDisposition: recordMapDisposition(bound),
    recordPlanDisposition: recordPlanDisposition(bound),
    recordExplainDisposition: recordExplainDisposition(bound),
    recordChangeRequestCandidates: recordChangeRequestCandidates(bound),
    recordManualMapping: recordManualMapping(bound),
  };
}
