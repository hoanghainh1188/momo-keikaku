/**
 * THE ONE PATH EVERY AUDITED WRITE RUNS (story 1.3 slice 2 — slice 1's `runProjectWrite`,
 * generalised so it is not project-shaped).
 *
 * Internal to `use-cases/`, like `project-input.ts`: not re-exported from `use-cases/index.ts`,
 * whose exports ARE the enumerated surface.
 */
import type { z } from 'zod';
import { refusingNonMembers, type AuditScope } from '../audit';
import type { AuditedWriteDeps, WriteStamp } from '../ports/audited-write';
import { fail, ok, type AppError, type AppErrorCode, type Result } from '../result';
import { auditActorOf, type RequestContext, type Role } from '../authz/request-context';
import { authorize } from '../authz/authorize';
import type { Clock } from '../ports/clock';

/** The offending field names, by zod issue code. Structured, never prose, never a value. */
export function invalidInputDetails(error: z.ZodError): NonNullable<AppError['details']> {
  return error.issues.reduce<NonNullable<AppError['details']>>((acc, issue) => {
    const field = issue.path.join('.') || '(input)';
    return { ...acc, [field]: [...(acc[field] ?? []), issue.code] };
  }, {});
}

/**
 * A use case's own refusal, raised INSIDE the transaction — `not_found` for a row the Tenant
 * cannot see, `invalid_input` for a rule a well-formed command breaks (a Program of another
 * Department). Thrown rather than returned so the transaction ROLLS BACK: whatever the work did
 * before it decided to refuse lands nowhere, and the use case answers the code.
 *
 * Module-private: only `refuse` constructs one, and `runAuditedWrite` is the only catcher, so an
 * adapter's error can never be mistaken for a refusal.
 */
class Refusal extends Error {
  constructor(
    readonly code: AppErrorCode,
    readonly details?: AppError['details'],
  ) {
    super(`refused: ${code}`);
  }
}

/** Refuses the command with `code`; the transaction rolls back and the use case answers it. */
export function refuse(code: AppErrorCode, details?: AppError['details']): never {
  throw new Refusal(code, details);
}

/** How one family of writes stamps and recognises its failures. */
export interface WritePlan<Scope, Command> {
  /** The event time, read inside the transaction (a Project's anchor, or the Clock). */
  readonly at: (scope: Scope, command: Command) => Promise<Date>;
  /** An adapter failure that means "not visible to this Tenant", answered `not_found`. */
  readonly isNotFound?: (error: unknown, command: Command) => boolean;
  /**
   * Optional check after a well-formed command is known and before the transaction opens
   * (story 1.5 Project reach). Return `not_found` to refuse without writing.
   */
  readonly authorize?: (ctx: RequestContext, command: Command) => Result<void>;
}

/**
 * Validates the input, opens ONE tenant transaction for the caller's Tenant, stamps it, and runs
 * `work` on that transaction's scope (AD-14).
 *
 *   * `invalid_input` for a malformed command — and no transaction is opened, so nothing can be
 *     written;
 *   * a `refuse(code)` inside the work — the transaction rolls back and the code is answered;
 *   * an adapter failure `plan.isNotFound` recognises — `not_found`, rolled back;
 *   * `ok`, carrying what `work` returned (a create's new id), once the change and its audit
 *     record have committed together;
 *   * ANYTHING ELSE PROPAGATES, rolled back: an outage, a constraint, a refused audit insert must
 *     never be reported as "does not exist", and never as success.
 *
 * `work` makes the change through the scope's repository and records it through
 * `audit.record(scope, stamp, …)`, both on the one transaction opened here. It sees a GUARDED
 * sink: a direct `append` with an action outside `AUDIT_ACTIONS` is refused too. Nothing in it may
 * open another transaction.
 */
export async function runAuditedWrite<Handle, Scope extends AuditScope, Command, Value = void>(
  schema: z.ZodType<Command>,
  deps: AuditedWriteDeps<Handle, Scope>,
  ctx: RequestContext,
  input: unknown,
  plan: WritePlan<Scope, Command>,
  work: (scope: Scope, stamp: WriteStamp, command: Command) => Promise<Value>,
): Promise<Result<Value>> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return fail('invalid_input', invalidInputDetails(parsed.error));

  const command = parsed.data;
  if (plan.authorize) {
    const gate = plan.authorize(ctx, command);
    if (!gate.ok) return gate;
  }

  try {
    const value = await deps.transaction(deps.handle, ctx.tenantId, async (scope) => {
      const at = await plan.at(scope, command);
      const guarded: Scope = { ...scope, audit: refusingNonMembers(scope.audit) };
      // The actor is the signed-in user of this request (story 1.4 slice 1), never a deps value.
      return work(guarded, { actor: auditActorOf(ctx), at }, command);
    });
    return ok(value);
  } catch (error) {
    if (error instanceof Refusal) return fail(error.code, error.details);
    if (plan.isNotFound?.(error, command)) return fail('not_found');
    throw error;
  }
}

/**
 * THE ONE WRAPPER FOR A ROLE-GATED, CLOCK-STAMPED AUDITED WRITE.
 *
 * Authorises the caller against `roles`, then runs `runAuditedWrite` stamping the event time from
 * the deps' Clock. That is the whole of what the Organisation, membership and Resource write
 * families each used to declare for themselves — `runOrgWrite` (story 1.3), `runMembershipWrite`
 * (1.4) and `runResourceWrite` (1.6) were three hand-written copies of this function, differing
 * only in their `Deps`/`Scope` types and, in the third, in taking `roles` as a parameter, which is
 * the generalisation the other two needed anyway. Epic 1 retrospective, F7.
 *
 * ORDER MATTERS AND IS PINNED. The role gate runs BEFORE `runAuditedWrite` parses the command, so
 * a caller outside the set is answered `not_found` and never `invalid_input` — refusing on the
 * shape of a command they were not allowed to send would disclose that the command exists.
 * `audited-write-gate.test.ts` asserts it.
 *
 * Project writes do NOT come through here: they stamp from the Project's own anchor rather than
 * the Clock, and gate on Project reach as well as roles, which is what `runProjectWrite`'s
 * `WritePlan` carries.
 */
export function runRoleGatedWrite<Handle, Scope extends AuditScope, Command, Value = void>(
  schema: z.ZodType<Command>,
  roles: readonly Role[],
  deps: AuditedWriteDeps<Handle, Scope> & { readonly clock: Clock },
  ctx: RequestContext,
  input: unknown,
  work: (scope: Scope, stamp: WriteStamp, command: Command) => Promise<Value>,
): Promise<Result<Value>> {
  const gate = authorize(ctx, { roles });
  if (!gate.ok) return Promise.resolve(gate);
  return runAuditedWrite(schema, deps, ctx, input, { at: async () => deps.clock.now() }, work);
}
