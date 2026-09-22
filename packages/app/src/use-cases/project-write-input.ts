/**
 * The inputs the five project write use cases take, and the one path that runs them.
 *
 * Internal to `use-cases/`, like `project-input.ts`: it is deliberately not re-exported from
 * `use-cases/index.ts`, whose exports ARE the surface the cross-tenant harness enumerates. A
 * schema or helper exported there would be reported as a use case with no registry entry.
 */
import { z } from 'zod';
import { authorize, PROJECT_REACH_ROLES } from '../authz/authorize';
import type { RequestContext } from '../authz/request-context';
import { isProjectNotFound } from '../ports/project-read';
import type { ProjectWriteDeps, ProjectWriteScope, WriteStamp } from '../ports/project-write';
import type { Result } from '../result';
import { runAuditedWrite } from './audited-write';

/**
 * A non-empty string Postgres will accept as a text parameter. NUL is refused for the reason
 * `project-input.ts` gives: Postgres rejects it ("null character not permitted"), so letting
 * it through turns a malformed form into a 500 instead of `invalid_input`.
 */
const noNul = (value: string) => !value.includes('\0');
const NUL_MESSAGE = 'must not contain a NUL character';

const id = z.string().min(1).refine(noNul, NUL_MESSAGE);

/**
 * Free text a PM typed. Refused when blank, but NOT trimmed here: the value is stored as the
 * caller supplied it, so the rows a web submission produces stay exactly what they were before
 * this slice (the action trims, as it always has).
 */
const prose = (max = Number.POSITIVE_INFINITY) =>
  z
    .string()
    .max(max)
    .refine((value) => value.trim().length > 0, 'must not be blank')
    .refine(noNul, NUL_MESSAGE);

const ticketIds = z.array(id).min(1).readonly();

/** The longest Explain note stored. The action truncates to it; a longer one is refused here. */
export const EXPLAIN_NOTE_MAX = 1000;

export const mapTicketsInputSchema = z.object({ projectId: id, wpId: id, ticketIds });

export const planTicketsInputSchema = z.object({
  projectId: id,
  // No length bound: the action never imposed one on a Work Package name, and this slice
  // preserves what lands.
  name: prose(),
  ticketIds,
});

export const explainTicketsInputSchema = z.object({
  projectId: id,
  note: prose(EXPLAIN_NOTE_MAX),
  ticketIds,
});

export const changeRequestCandidatesInputSchema = z.object({ projectId: id, ticketIds });

/** `wpId` may be empty — that is an unmap — but not NUL-bearing. */
export const mapTicketInputSchema = z.object({
  projectId: id,
  ticketId: id,
  wpId: z.string().refine(noNul, NUL_MESSAGE),
});

/** Derived from the schemas, so the types and the validation cannot drift apart. */
export type MapTicketsInput = Readonly<z.infer<typeof mapTicketsInputSchema>>;
export type PlanTicketsInput = Readonly<z.infer<typeof planTicketsInputSchema>>;
export type ExplainTicketsInput = Readonly<z.infer<typeof explainTicketsInputSchema>>;
export type ChangeRequestCandidatesInput = Readonly<
  z.infer<typeof changeRequestCandidatesInputSchema>
>;
export type MapTicketInput = Readonly<z.infer<typeof mapTicketInputSchema>>;

/**
 * Authorises the caller (`tenant_admin` | `pm`, roles before parse), validates the input, checks
 * Project reach, opens ONE tenant transaction for the caller's Tenant, reads the Project's
 * anchor inside it, and runs `work` on that transaction's scope with the stamp — then maps an
 * invisible Project to `not_found`.
 *
 * Since story 1.3 slice 2 this is `runAuditedWrite` (`./audited-write.ts`, the path every audited
 * write shares) with the project writes' particulars: the event time is the Project's
 * `demoAnchor` (so the rows stay byte-identical — no Clock here), an invisible Project is the
 * adapter's `project <id> not found` rejection (`isProjectNotFound`), and story 1.5's Project
 * reach sits on the plan after parse. The rest of the contract — one transaction,
 * `invalid_input` before it opens, the guarded audit sink, nothing else caught — is that
 * function's, unchanged.
 */
export async function runProjectWrite<Handle, Command extends { readonly projectId: string }>(
  schema: z.ZodType<Command>,
  deps: ProjectWriteDeps<Handle>,
  ctx: RequestContext,
  input: unknown,
  work: (scope: ProjectWriteScope, stamp: WriteStamp, command: Command) => Promise<void>,
): Promise<Result<void>> {
  const roles = authorize(ctx, { roles: PROJECT_REACH_ROLES });
  if (!roles.ok) return roles;

  return runAuditedWrite(
    schema,
    deps,
    ctx,
    input,
    {
      at: (scope, command) => scope.projectWrite.projectAnchor(command.projectId),
      isNotFound: (error, command) => isProjectNotFound(error, command.projectId),
      authorize: (caller, command) =>
        authorize(caller, { roles: PROJECT_REACH_ROLES, projectId: command.projectId }),
    },
    work,
  );
}
