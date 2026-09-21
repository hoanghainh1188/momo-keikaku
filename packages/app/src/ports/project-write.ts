import type { AuditSink } from '../audit';
import type { AuditedWriteDeps, WriteStamp } from './audited-write';

export type { WriteStamp } from './audited-write';

/**
 * The port the five project write use cases depend on — FR-29's four Dispositions and FR-21's
 * manual Mapping — reshaped by story 1.3 slice 1 onto the tenant transaction.
 *
 * DECLARED HERE, SATISFIED STRUCTURALLY, exactly like `ProjectReadPort`: `packages/db` may not
 * import `@momo/app`, so `packages/db/src/repo-writes.ts` is shaped to match these types and
 * TypeScript checks the match with a `satisfies` at each composition root. The members are
 * function-typed PROPERTIES so their parameters are checked strictly rather than bivariantly.
 *
 * ONE TRANSACTION PER USE CASE (AD-14). The deps carry a `TenantTransaction` whose scope holds the
 * project write REPOSITORY and the AUDIT SINK, both bound to that one transaction for that one
 * Tenant. A use case opens it once, reads the Project's anchor, makes its change through the
 * repository and calls `audit.record` on the same scope — so the change and its record commit
 * together or not at all. The repository no longer writes `audit_log`; the audit sink is the one
 * writer of it, and `audit.record` the one caller.
 *
 * An invisible Project is reported the way the read port reports it: `projectAnchor` REJECTS
 * with `project <projectId> not found …` (see `isProjectNotFound`), inside the transaction, so
 * nothing lands.
 *
 * THE FOUR DISPOSITION COMMANDS CARRY THEIR `kind` as a literal. Without it the repository could be
 * miswired silently: a Change Request candidate's command (`projectId`, `ticketIds`) is a
 * structural SUBSET of the other three, so `recordChangeRequestCandidates` would type-check in
 * the Explain slot — measured in story 1.2 slice 4 — and every Explain would land as a candidate.
 * The literal makes each slot accept its own function only.
 *
 * `actor` is audit data, passed beside the Tenant. It is not a `UseCaseContext` field: adding
 * one there is story 1.4's decision. The composition root states it once, next to the Tenant,
 * and 1.4 replaces both lines together.
 */

/** FR-29 *Map*: the Tickets are mapped to an existing Work Package. */
export interface MapDispositionCommand {
  readonly kind: 'map';
  readonly projectId: string;
  readonly wpId: string;
  readonly ticketIds: readonly string[];
}

/** FR-29 *Plan*: a new Work Package named `name` is created and the Tickets mapped to it. */
export interface PlanDispositionCommand {
  readonly kind: 'plan';
  readonly projectId: string;
  readonly name: string;
  readonly ticketIds: readonly string[];
}

/** FR-29 *Explain*: a note is attached to the Tickets. */
export interface ExplainDispositionCommand {
  readonly kind: 'explain';
  readonly projectId: string;
  readonly note: string;
  readonly ticketIds: readonly string[];
}

/** FR-29 *Change Request candidate*: the Tickets are collected into the candidate list. */
export interface ChangeRequestCandidateCommand {
  readonly kind: 'cr_candidate';
  readonly projectId: string;
  readonly ticketIds: readonly string[];
}

/**
 * FR-21 manual Mapping of one Ticket. `wpId` is the empty string for an UNMAP: the event then
 * carries a null Work Package and the audit action is `mapping.unmap`. The empty string, not
 * `null`, because that is what the audit payload has always recorded (`{ wpId: '' }`), and this
 * slice preserves the rows byte for byte.
 */
export interface ManualMappingCommand {
  readonly projectId: string;
  readonly ticketId: string;
  readonly wpId: string;
}

/**
 * One repository write, stamped with who and when (`WriteStamp`, `./audited-write`): the actor
 * from the deps, and the event time — the Project's `demoAnchor`, read inside the transaction by
 * `projectAnchor` (the project writes keep the anchor, so their rows stay byte-identical; the
 * organisation writes take a Clock). The Tenant is not in the stamp: the repository is bound to
 * its transaction's Tenant.
 */
type WriteMember<Command, Landed = void> = (stamp: WriteStamp, command: Command) => Promise<Landed>;

/**
 * The project write repository, BOUND TO ONE TRANSACTION AND ONE TENANT: every member issues its
 * statements on the scope's transaction and opens none of its own.
 */
export interface ProjectWriteRepository {
  /** The Project's event time; rejects with the not-found wording for an invisible Project. */
  readonly projectAnchor: (projectId: string) => Promise<Date>;
  readonly recordMapDisposition: WriteMember<MapDispositionCommand>;
  /** Returns the id of the Work Package it created, which the audit payload records. */
  readonly recordPlanDisposition: WriteMember<PlanDispositionCommand, { readonly wpId: string }>;
  readonly recordExplainDisposition: WriteMember<ExplainDispositionCommand>;
  readonly recordChangeRequestCandidates: WriteMember<ChangeRequestCandidateCommand>;
  readonly recordManualMapping: WriteMember<ManualMappingCommand>;
}

/** What one project write transaction hands its work: the repository and the audit sink. */
export interface ProjectWriteScope {
  readonly projectWrite: ProjectWriteRepository;
  readonly audit: AuditSink;
}

/**
 * What a project write use case is given: the transaction to open, the handle it is opened on,
 * and the actor the rows name — slice 2's generic `AuditedWriteDeps` over this scope. All three
 * are chosen by the composition root.
 */
export type ProjectWriteDeps<Handle> = AuditedWriteDeps<Handle, ProjectWriteScope>;
