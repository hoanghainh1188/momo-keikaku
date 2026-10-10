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
    // Mapping Rules authored by the PM (story 5.10 / FR-22). Each records the rule (before / after
    // where there is one) and how many Tickets the same-transaction re-evaluation moved.
    'mapping.rule_create',
    'mapping.rule_update',
    'mapping.rule_delete',
    'mapping.rule_reorder',
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
    // Resources and dated Rates (story 1.6, FR-12 / NFR-A1's "Rates"): create is empty of Rates;
    // each Rate append is its own record. The Project default Rate dual-writes the column head.
    'resource.create',
    'rate.append',
    'project_default_rate.append',
    // Tracker Account → Resource links (story 5.8 / FR-13). Payloads carry opaque ids only.
    'tracker_account.link',
    'tracker_account.unlink',
    // Scheduling fence (story 2.9): one record per applyPlanChange.
    'schedule.apply_plan_change',
    // Holiday Calendar publish (story 2.12 / AR-57): per-Project audit on publish / fan-out.
    'calendar.publish_version',
    // First Set Baseline (story 4.1 / FR-15).
    'baseline.set',
    // Re-baseline with mandatory reason (story 4.3 / FR-16).
    'baseline.rebaseline',
    // Backlog Connector set-up / rotate / scope (story 5.2 / FR-17). Payloads never carry secrets.
    'connector.add',
    'connector.rotate_credentials',
    'connector.change_scope',
    'connector.confirm_ownership',
    'connector.append_resolved_statuses',
];
const MEMBERS = new Set(AUDIT_ACTIONS);
/** True for a member of the closed enum. */
export function isAuditAction(value) {
    return typeof value === 'string' && MEMBERS.has(value);
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
async function record(scope, ctx, action, target, payload) {
    await refusingNonMembers(scope.audit).append({ actor: ctx.actor, at: ctx.at, action, target, payload });
}
/**
 * The sink, guarded: an entry whose action is not a member of `AUDIT_ACTIONS` is refused before
 * the underlying sink sees it. `audit.record` goes through it, and `runProjectWrite` hands a use
 * case's work a scope whose sink is already wrapped — so a write calling `scope.audit.append`
 * directly with a forced action is refused too. `packages/db`'s sink takes any string.
 */
export function refusingNonMembers(sink) {
    return {
        append: async (entry) => {
            if (!isAuditAction(entry.action)) {
                throw new Error(`audit was given the action ${stringify(String(entry.action))}, which is not a member of ` +
                    'AUDIT_ACTIONS (packages/app/src/audit/index.ts). Add it to the enum; never record a free string.');
            }
            await sink.append(entry);
        },
    };
}
export const audit = { record };
export { AUDIT_PAYLOAD_BY_ACTION, auditPayloadSchema, decodeAuditPayload, } from './payloads';
