import { PROJECT_REACH, type RoleDeclaration } from '../authz/authorize';
import { audit, type AuditDeclaration } from '../audit';
import type { Result } from '../result';
import type { ProjectWriteDeps, ProjectWriteScope } from '../ports/project-write';
import type { RequestContext } from '../authz/request-context';
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
import { refuse } from './audited-write';

/**
 * The five project writes: FR-29's four Dispositions and FR-21's manual Mapping. All five are on
 * NFR-A1's list, so all five are AUDITED (AD-14): each makes its change and calls `audit.record`
 * inside the one tenant transaction `runProjectWrite` opens, on the scope it hands them.
 *
 * Every one has the same contract, which `runProjectWrite` holds in one place:
 *
 *   * `invalid_input` for a malformed command (no Tickets, a blank name or note, an empty id,
 *     a NUL) — and no transaction is opened, so nothing is written;
 *   * `not_found` when the Project does not exist OR belongs to another Tenant — one event
 *     under row-level security — and the transaction has rolled back, so nothing is written for
 *     either Tenant;
 *   * `ok` once the change and its audit record have committed together;
 *   * anything else propagates, the transaction rolled back.
 *
 * The Tenant comes from `ctx` and nowhere else; the actor from `deps`, where the composition
 * root put it beside the Tenant.
 *
 * The Work Package a Mapping names must be a mappable leaf of the command's Project (AD-12 +
 * FR-21): `mapTickets` and `mapTicket` ask the repository before they write and refuse
 * `not_found` otherwise, so nothing lands and nothing is audited. An unmap (`mapTicket` with an
 * empty `wpId`) names no Work Package and is exempt — it records `release` (story 5.9 / A4).
 * Tickets must belong to the Project (tracker issue id → `ticket` row; AR-18).
 *
 * THE AUDIT PAYLOADS are exactly what `packages/db` recorded before this slice moved the insert
 * here: `{ ticketIds, wpId, note }` against the Project for a Disposition, `{ wpId }` against the
 * Ticket for a manual Mapping — the raw `wpId`, so an unmap records the empty string.
 */

/** Refuses `not_found` unless `wpId` is a mappable leaf WP of `projectId` — before anything is written. */
async function requireWorkPackageOf(
  scope: ProjectWriteScope,
  projectId: string,
  wpId: string,
): Promise<void> {
  if (!(await scope.projectWrite.workPackageInProject(projectId, wpId))) refuse('not_found');
}

/** Refuses `not_found` unless each Ticket (tracker issue id) belongs to `projectId`. */
async function requireTicketsOf(
  scope: ProjectWriteScope,
  projectId: string,
  ticketIds: readonly string[],
): Promise<void> {
  for (const ticketId of ticketIds) {
    if (!(await scope.projectWrite.ticketInProject(projectId, ticketId))) refuse('not_found');
  }
}

/** FR-29 *Map*: the hours leave Unplanned Work immediately (FR-21 attribution). */
export async function mapTickets<Handle>(
  deps: ProjectWriteDeps<Handle>,
  ctx: RequestContext,
  input: MapTicketsInput,
): Promise<Result<void>> {
  return runProjectWrite(mapTicketsInputSchema, deps, ctx, input, async (scope, stamp, command) => {
    const { projectId, wpId, ticketIds } = command;
    await requireWorkPackageOf(scope, projectId, wpId);
    await requireTicketsOf(scope, projectId, ticketIds);
    await scope.projectWrite.recordMapDisposition(stamp, { ...command, kind: 'map' });
    await audit.record(scope, stamp, 'disposition.map', projectId, {
      ticketIds: [...ticketIds],
      wpId,
      note: null,
    });
  });
}

/**
 * FR-29 *Plan*: creates a Work Package in the Current Plan and maps the Tickets to it. Its
 * hours stay Unplanned Work until a Re-baseline includes the Work Package.
 */
export async function planTicketsAsWorkPackage<Handle>(
  deps: ProjectWriteDeps<Handle>,
  ctx: RequestContext,
  input: PlanTicketsInput,
): Promise<Result<void>> {
  return runProjectWrite(planTicketsInputSchema, deps, ctx, input, async (scope, stamp, command) => {
    const { projectId, ticketIds } = command;
    await requireTicketsOf(scope, projectId, ticketIds);
    const { wpId } = await scope.projectWrite.recordPlanDisposition(stamp, {
      ...command,
      kind: 'plan',
      wpId: deps.ids.next(),
    });
    await audit.record(scope, stamp, 'disposition.plan', projectId, {
      ticketIds: [...ticketIds],
      wpId,
      note: null,
    });
  });
}

/** FR-29 *Explain*: attaches a note. Clients see it only if a snapshot is published. */
export async function explainTickets<Handle>(
  deps: ProjectWriteDeps<Handle>,
  ctx: RequestContext,
  input: ExplainTicketsInput,
): Promise<Result<void>> {
  return runProjectWrite(explainTicketsInputSchema, deps, ctx, input, async (scope, stamp, command) => {
    const { projectId, note, ticketIds } = command;
    await scope.projectWrite.recordExplainDisposition(stamp, { ...command, kind: 'explain' });
    await audit.record(scope, stamp, 'disposition.explain', projectId, {
      ticketIds: [...ticketIds],
      wpId: null,
      note,
    });
  });
}

/** FR-29 *Change Request candidate*: collects the Tickets into the candidate list. */
export async function markChangeRequestCandidates<Handle>(
  deps: ProjectWriteDeps<Handle>,
  ctx: RequestContext,
  input: ChangeRequestCandidatesInput,
): Promise<Result<void>> {
  return runProjectWrite(
    changeRequestCandidatesInputSchema,
    deps,
    ctx,
    input,
    async (scope, stamp, command) => {
      const { projectId, ticketIds } = command;
      await scope.projectWrite.recordChangeRequestCandidates(stamp, {
        ...command,
        kind: 'cr_candidate',
      });
      await audit.record(scope, stamp, 'disposition.cr_candidate', projectId, {
        ticketIds: [...ticketIds],
        wpId: null,
        note: null,
      });
    },
  );
}

/** FR-21 manual Mapping of one Ticket; an empty `wpId` releases it (`source = release`). */
export async function mapTicket<Handle>(
  deps: ProjectWriteDeps<Handle>,
  ctx: RequestContext,
  input: MapTicketInput,
): Promise<Result<void>> {
  return runProjectWrite(mapTicketInputSchema, deps, ctx, input, async (scope, stamp, command) => {
    const { projectId, ticketId, wpId } = command;
    await requireTicketsOf(scope, projectId, [ticketId]);
    if (wpId !== '') await requireWorkPackageOf(scope, projectId, wpId);
    await scope.projectWrite.recordManualMapping(stamp, command);
    await audit.record(scope, stamp, wpId === '' ? 'mapping.unmap' : 'mapping.map', ticketId, {
      wpId,
    });
  });
}

/**
 * What each write above records, declared for the audit gate (`tests/audited-use-cases.test.ts`).
 * Keyed by the use case's exported name; the gate asserts the keys against the use-case surface
 * both ways, so a renamed or added write cannot fall out of it.
 */
export const PROJECT_WRITE_AUDIT = {
  mapTickets: { audited: ['disposition.map'] },
  planTicketsAsWorkPackage: { audited: ['disposition.plan'] },
  explainTickets: { audited: ['disposition.explain'] },
  markChangeRequestCandidates: { audited: ['disposition.cr_candidate'] },
  mapTicket: { audited: ['mapping.map', 'mapping.unmap'] },
} as const satisfies Readonly<Record<string, AuditDeclaration>>;

/** Role declarations for the Plan/Mapping writes (colocated — see `role-declarations.ts`). */
export const PROJECT_WRITE_ROLES = {
  planTicketsAsWorkPackage: PROJECT_REACH,
  mapTickets: PROJECT_REACH,
  mapTicket: PROJECT_REACH,
  explainTickets: PROJECT_REACH,
  markChangeRequestCandidates: PROJECT_REACH,
} as const satisfies Readonly<Record<string, RoleDeclaration>>;
