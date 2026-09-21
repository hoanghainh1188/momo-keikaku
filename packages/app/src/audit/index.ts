import { stringify } from '@momo/domain';

/**
 * THE AUDIT MECHANISM (AD-14, AR-26, story 1.3 slice 1).
 *
 * Every use case on NFR-A1's list calls `audit.record(scope, ctx, action, target, payload)`
 * INSIDE the one tenant transaction it opened (`ports/tenant-transaction.ts`), on the scope that
 * transaction handed it. The record is written through that scope's audit sink, which
 * `packages/db` binds to the same transaction as the change — so the change and its record
 * commit together or not at all: a change that rolls back leaves no audit row, and an audit
 * insert that fails rolls the change back with it.
 *
 * `record` takes the SCOPE, not a handle. There is no way to call it with a connection of its
 * own: an audit record written on a second transaction would survive the change's rollback,
 * which is exactly what AD-14 forbids. The gate (`tests/audited-use-cases.test.ts`) drives
 * every audited use case against a fake transaction and fails if one opens a second, or
 * commits without its record.
 *
 * THE ACTION IS A MEMBER OF A CLOSED ENUM, declared once, here. A later story adds a member to
 * `AUDIT_ACTIONS` — never a free string at a call site. `record` refuses a non-member at run
 * time too, for a caller that forced one past the type (`as never`, a value off the wire):
 * `audit_log.action` has no database constraint (a deliberate choice — the schema, grants and
 * triggers are not this slice's), so this check is the only one.
 *
 * The first six members are the strings `packages/db` wrote free-hand before slice 1 — FR-29's
 * four Dispositions and FR-21's manual Mapping — unchanged, so the rows stay byte for byte what
 * they were. Story 1.3 slice 2 appended the eight organisation changes; story 1.4 slice 2 appended
 * the four membership changes.
 */
export const AUDIT_ACTIONS = [
  'disposition.map',
  'disposition.plan',
  'disposition.explain',
  'disposition.cr_candidate',
  'mapping.map',
  'mapping.unmap',
  // FR-1's organisation changes (story 1.3 slice 2), each recording the previous value where
  // there is one. PM assignment joined with story 1.4 slice 2, below.
  'department.create',
  'department.rename',
  'program.create',
  'program.rename',
  'project.create',
  'project.rename',
  'project.reassign_program',
  'project.reassign_department',
  // Membership changes (story 1.4 slice 2, NFR-A1's "role, membership and revocation changes"):
  // each targets the member's user id and records the previous value. PM assignment is here —
  // a Project added to or removed from a membership's `project_ids`.
  'membership.revoke',
  'membership.change_role',
  'membership.assign_project',
  'membership.unassign_project',
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];

const MEMBERS: ReadonlySet<string> = new Set(AUDIT_ACTIONS);

/** True for a member of the closed enum. */
export function isAuditAction(value: unknown): value is AuditAction {
  return typeof value === 'string' && MEMBERS.has(value);
}

/**
 * Who and when, stamped on the record. `at` is the event time the use case stamps on the change
 * itself (the Project's `demoAnchor` for the project writes, the `Clock` for the organisation
 * writes), so the two cannot disagree.
 */
export interface AuditStamp {
  readonly actor: string;
  readonly at: Date;
}

/** One audit record, as the sink receives it. The Tenant is the sink's own: it is bound to it. */
export interface AuditEntry extends AuditStamp {
  readonly action: AuditAction;
  readonly target: string;
  /** Written through the domain's codec (AD-4) by the sink, so a `bigint` is a decimal string. */
  readonly payload: unknown;
}

/**
 * Where records go: `audit_log`, through the codec, on the transaction the scope belongs to.
 * `packages/db` satisfies it structurally (`packages/db/src/audit-sink.ts`).
 */
export interface AuditSink {
  readonly append: (entry: AuditEntry) => Promise<void>;
}

/** Any transaction scope that carries an audit sink. */
export interface AuditScope {
  readonly audit: AuditSink;
}

/**
 * Records one audited action on the scope's transaction.
 *
 * @param scope the scope the use case's tenant transaction handed it — never anything else.
 * @param ctx who acted and when.
 * @param action a member of `AUDIT_ACTIONS`; anything else is refused before the sink is called.
 * @param target the id the action was applied to (a Project, a Ticket).
 * @param payload what changed, including the previous value where there is one.
 */
async function record(
  scope: AuditScope,
  ctx: AuditStamp,
  action: AuditAction,
  target: string,
  payload: unknown,
): Promise<void> {
  await refusingNonMembers(scope.audit).append({ actor: ctx.actor, at: ctx.at, action, target, payload });
}

/**
 * The sink, guarded: an entry whose action is not a member of `AUDIT_ACTIONS` is refused before
 * the underlying sink sees it. `audit.record` goes through it, and `runProjectWrite` hands a use
 * case's work a scope whose sink is already wrapped — so a write calling `scope.audit.append`
 * directly with a forced action is refused too. `packages/db`'s sink takes any string.
 */
export function refusingNonMembers(sink: AuditSink): AuditSink {
  return {
    append: async (entry) => {
      if (!isAuditAction(entry.action)) {
        throw new Error(
          `audit was given the action ${stringify(String(entry.action))}, which is not a member of ` +
            'AUDIT_ACTIONS (packages/app/src/audit/index.ts). Add it to the enum; never record a free string.',
        );
      }
      await sink.append(entry);
    },
  };
}

export const audit = { record } as const;

/**
 * What a use case that changes anything declares about its audit, for the gate
 * (`tests/audited-use-cases.test.ts`): the actions it records — at least one — or, for a change
 * that is not on NFR-A1's list, why it records none. The gate drives every declared-audited use
 * case against a fake transaction (exactly one record, of a declared action, on commit; none when
 * the work throws), and fails, naming it, on any write use case that declares neither.
 */
export type AuditDeclaration =
  | { readonly audited: readonly [AuditAction, ...AuditAction[]] }
  | { readonly unaudited: string };
