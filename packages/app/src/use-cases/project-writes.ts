import type { Result } from '../result';
import type { ProjectWriteDeps } from '../ports/project-write';
import type { UseCaseContext } from './context';
import {
  changeRequestCandidatesInputSchema,
  explainTicketsInputSchema,
  mapTicketInputSchema,
  mapTicketsInputSchema,
  planTicketsInputSchema,
  runProjectWrite,
  type ChangeRequestCandidatesInput,
  type ExplainTicketsInput,
  type MapTicketInput,
  type MapTicketsInput,
  type PlanTicketsInput,
} from './project-write-input';

/**
 * The five project writes: FR-29's four Dispositions and FR-21's manual Mapping.
 *
 * Every one has the same contract, which `runProjectWrite` holds in one place:
 *
 *   * `invalid_input` for a malformed command (no Tickets, a blank name or note, an empty id,
 *     a NUL) — and the port is never called, so nothing is written;
 *   * `not_found` when the Project does not exist OR belongs to another Tenant — one event
 *     under row-level security — and the adapter's transaction has rolled back, so nothing is
 *     written for either Tenant;
 *   * `ok` once the event rows and their audit row have committed together (AD-14);
 *   * anything else propagates.
 *
 * The Tenant comes from `ctx` and nowhere else; the actor from `deps`, where the composition
 * root put it beside the Tenant.
 *
 * Not checked here, as it never was: that the Tickets or the Work Package belong to the
 * Project. That is a later story's rule, not a rewiring's.
 */

/** FR-29 *Map*: the hours leave Unplanned Work immediately (FR-21 attribution). */
export async function mapTickets<Handle>(
  deps: ProjectWriteDeps<Handle>,
  ctx: UseCaseContext,
  input: MapTicketsInput,
): Promise<Result<void>> {
  return runProjectWrite(mapTicketsInputSchema, ctx, input, (tenantId, command) =>
    deps.projectWrite.recordMapDisposition(deps.handle, tenantId, deps.actor, {
      ...command,
      kind: 'map',
    }),
  );
}

/**
 * FR-29 *Plan*: creates a Work Package in the Current Plan and maps the Tickets to it. Its
 * hours stay Unplanned Work until a Re-baseline includes the Work Package.
 */
export async function planTicketsAsWorkPackage<Handle>(
  deps: ProjectWriteDeps<Handle>,
  ctx: UseCaseContext,
  input: PlanTicketsInput,
): Promise<Result<void>> {
  return runProjectWrite(planTicketsInputSchema, ctx, input, (tenantId, command) =>
    deps.projectWrite.recordPlanDisposition(deps.handle, tenantId, deps.actor, {
      ...command,
      kind: 'plan',
    }),
  );
}

/** FR-29 *Explain*: attaches a note. Clients see it only if a snapshot is published. */
export async function explainTickets<Handle>(
  deps: ProjectWriteDeps<Handle>,
  ctx: UseCaseContext,
  input: ExplainTicketsInput,
): Promise<Result<void>> {
  return runProjectWrite(explainTicketsInputSchema, ctx, input, (tenantId, command) =>
    deps.projectWrite.recordExplainDisposition(deps.handle, tenantId, deps.actor, {
      ...command,
      kind: 'explain',
    }),
  );
}

/** FR-29 *Change Request candidate*: collects the Tickets into the candidate list. */
export async function markChangeRequestCandidates<Handle>(
  deps: ProjectWriteDeps<Handle>,
  ctx: UseCaseContext,
  input: ChangeRequestCandidatesInput,
): Promise<Result<void>> {
  return runProjectWrite(changeRequestCandidatesInputSchema, ctx, input, (tenantId, command) =>
    deps.projectWrite.recordChangeRequestCandidates(deps.handle, tenantId, deps.actor, {
      ...command,
      kind: 'cr_candidate',
    }),
  );
}

/** FR-21 manual Mapping of one Ticket; an empty `wpId` unmaps it. */
export async function mapTicket<Handle>(
  deps: ProjectWriteDeps<Handle>,
  ctx: UseCaseContext,
  input: MapTicketInput,
): Promise<Result<void>> {
  return runProjectWrite(mapTicketInputSchema, ctx, input, (tenantId, command) =>
    deps.projectWrite.recordManualMapping(deps.handle, tenantId, deps.actor, command),
  );
}
