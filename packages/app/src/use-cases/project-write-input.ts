/**
 * The inputs the five project write use cases take, and the one path that runs them.
 *
 * Internal to `use-cases/`, like `project-input.ts`: it is deliberately not re-exported from
 * `use-cases/index.ts`, whose exports ARE the surface the cross-tenant harness enumerates. A
 * schema or helper exported there would be reported as a use case with no registry entry.
 */
import { z } from 'zod';
import { refusingNonMembers } from '../audit';
import { fail, ok, type AppError, type Result } from '../result';
import { isProjectNotFound } from '../ports/project-read';
import type { ProjectWriteDeps, ProjectWriteScope, WriteStamp } from '../ports/project-write';
import type { UseCaseContext } from './context';

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

/** The offending field names, by zod issue code. Structured, never prose, never a value. */
function invalidInputDetails(error: z.ZodError): NonNullable<AppError['details']> {
  return error.issues.reduce<NonNullable<AppError['details']>>((acc, issue) => {
    const field = issue.path.join('.') || '(input)';
    return { ...acc, [field]: [...(acc[field] ?? []), issue.code] };
  }, {});
}

/**
 * Validates the input, opens ONE tenant transaction for the caller's Tenant, reads the Project's
 * anchor inside it, and runs `work` on that transaction's scope with the stamp — then maps an
 * invisible Project to `not_found`.
 *
 * `work` makes the change through `scope.projectWrite` and records it through
 * `audit.record(scope, stamp, …)`, both on the one transaction opened here (AD-14). Nothing
 * in it may open another: this is the only transaction boundary a write use case has.
 *
 * NOTHING ELSE IS CAUGHT, for the reason the read path gives: a write that failed for any other
 * reason — an outage, a constraint, a refused audit insert — must not be reported as "this
 * Project does not exist", and must never be reported as success. The transaction has rolled
 * back by the time it propagates, so nothing landed.
 */
export async function runProjectWrite<Handle, Command extends { readonly projectId: string }>(
  schema: z.ZodType<Command>,
  deps: ProjectWriteDeps<Handle>,
  ctx: UseCaseContext,
  input: unknown,
  work: (scope: ProjectWriteScope, stamp: WriteStamp, command: Command) => Promise<void>,
): Promise<Result<void>> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return fail('invalid_input', invalidInputDetails(parsed.error));

  const command = parsed.data;
  try {
    await deps.transaction(deps.handle, ctx.tenantId, async (scope) => {
      const at = await scope.projectWrite.projectAnchor(command.projectId);
      // The work sees only a guarded sink: a direct `append` with a non-enum action is refused.
      const guarded = { ...scope, audit: refusingNonMembers(scope.audit) };
      await work(guarded, { actor: deps.actor, at }, command);
    });
    return ok(undefined);
  } catch (error) {
    if (isProjectNotFound(error, command.projectId)) return fail('not_found');
    throw error;
  }
}
