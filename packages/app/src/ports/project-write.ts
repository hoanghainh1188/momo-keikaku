/**
 * The port the five project write use cases depend on — FR-29's four Dispositions and FR-21's
 * manual Mapping.
 *
 * DECLARED HERE, SATISFIED STRUCTURALLY, exactly like `ProjectReadPort`: `packages/db` may not
 * import `@momo/app`, so its write functions (`packages/db/src/repo-writes.ts`) are shaped to
 * match these members and TypeScript checks the match with a `satisfies` at the composition
 * root. The handle is a type parameter; the members are function-typed PROPERTIES so the
 * parameters are checked strictly rather than bivariantly.
 *
 * EACH MEMBER IS ONE TRANSACTION. The adapter opens `withTenant(handle, tenantId, …)`, reads the
 * Project (its `demoAnchor` is the event time), and writes the event rows plus their
 * `audit_log` row inside it — AD-14's "the change and its record commit together or not at
 * all". A Project the Tenant cannot see is reported the way the read port reports it: the
 * member REJECTS with `project <projectId> not found …` (see `isProjectNotFound`), and because
 * the rejection happens inside the transaction, nothing lands.
 *
 * THE FOUR DISPOSITION COMMANDS CARRY THEIR `kind` as a literal. Without it the port could be
 * miswired silently: a Change Request candidate's command (`projectId`, `ticketIds`) is a
 * structural SUBSET of the other three, so `recordChangeRequestCandidates` would type-check in
 * the Explain slot at the composition root — measured — and every Explain would land as a
 * candidate. The literal makes each slot accept its own function only.
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

type WriteMember<Handle, Command> = (
  handle: Handle,
  tenantId: string,
  actor: string,
  command: Command,
) => Promise<void>;

export interface ProjectWritePort<Handle> {
  readonly recordMapDisposition: WriteMember<Handle, MapDispositionCommand>;
  readonly recordPlanDisposition: WriteMember<Handle, PlanDispositionCommand>;
  readonly recordExplainDisposition: WriteMember<Handle, ExplainDispositionCommand>;
  readonly recordChangeRequestCandidates: WriteMember<Handle, ChangeRequestCandidateCommand>;
  readonly recordManualMapping: WriteMember<Handle, ManualMappingCommand>;
}

/**
 * What a project write use case is given: the port, the handle it is called with, and the
 * actor the audit rows name. All three are chosen by the composition root.
 */
export interface ProjectWriteDeps<Handle> {
  readonly handle: Handle;
  readonly actor: string;
  readonly projectWrite: ProjectWritePort<Handle>;
}
