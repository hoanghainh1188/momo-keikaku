import { ADMIN_ONLY, type RoleDeclaration } from '../authz/authorize';
import type { z } from 'zod';
import { audit, type AuditDeclaration } from '../audit';
import { TENANT_ADMIN, TENANT_ADMIN_ROLES } from '../authz/authorize';
import type { RequestContext } from '../authz/request-context';
import type { WriteStamp } from '../ports/audited-write';
import type {
  LockedMemberRow,
  MembershipWriteDeps,
  MembershipWriteScope,
} from '../ports/membership-write';
import type { Result } from '../result';
import { refuse, runRoleGatedWrite } from './audited-write';
import {
  assignMemberProjectInputSchema,
  changeMemberRoleInputSchema,
  revokeMembershipInputSchema,
  unassignMemberProjectInputSchema,
  type AssignMemberProjectInput,
  type ChangeMemberRoleInput,
  type RevokeMembershipInput,
  type UnassignMemberProjectInput,
} from './membership-input';

/**
 * THE MEMBERSHIP WRITES (story 1.4 slice 2) — FR-3's revocation and NFR-A1's "role, membership and
 * revocation changes": a membership revoked, its role changed, a Project assigned to or removed
 * from it. No screen yet; the composition root binds them for a future server action.
 *
 * Every one is AUDITED (AD-14) through `runAuditedWrite`: the change and its `audit.record`
 * commit together inside one tenant transaction for `ctx.tenantId`, stamped by the Clock, and the
 * record's target is the MEMBER'S user id, with the previous value.
 *
 * THE SHARED CONTRACT, in the order it is checked:
 *
 *   1. Declared roles (`tenant_admin` only) via `authorize` (story 1.5), or `not_found` — BEFORE
 *      anything else: no parse, no transaction, so a non-admin learns nothing, not even that its
 *      input was malformed.
 *   2. `invalid_input` for a malformed command — an empty or NUL-bearing id, a role that is not
 *      assignable (`client_viewer`, `internal_viewer`, any other string).
 *   3. Inside the transaction, ONE ordered lock statement (`lockMembers`: the Tenant's admin rows
 *      plus the caller's and the target's), then, in TypeScript and in this order:
 *        a. the CALLER must be among the locked `tenant_admin` rows, else `not_found` — a context
 *           resolved once per server action may be stale (demoted, or revoked, since);
 *        b. the TARGET must be among the locked rows, else `not_found` — no membership in this
 *           Tenant, or only in another;
 *        c. for revoke and change role, the LAST ADMIN: revoking or demoting the Tenant's only
 *           `tenant_admin` (the caller included) is `invalid_input`, rule `last_tenant_admin`.
 *   4. A no-op — the role it already has, a Project already held, a Project not held — commits
 *      nothing and records nothing, so the log carries only changes.
 *
 * Revocation deletes the row. The use cases never touch a session: `resolveRequestContext` ends
 * the revoked user's session on their next request, because its active Tenant no longer has a
 * membership. Out of scope: adding a user to a Tenant (invitation), creating users.
 */

/** The rule code `invalid_input` names under `details.userId` when the last admin would go. */
export const LAST_TENANT_ADMIN = 'last_tenant_admin';

/** What the lock found: the target's row, and how many `tenant_admin` rows the Tenant has. */
interface Locked {
  readonly target: LockedMemberRow;
  readonly admins: number;
}

/**
 * Runs one membership write: the declared-roles gate first (no parse, no transaction), then the
 * audited write, Clock-stamped. `refuse` inside `work` answers a code, rolled back.
 */
/**
 * Takes the one lock, then checks the caller and the target, in that order (3a, 3b above).
 */
async function lockCallerAndTarget(
  scope: MembershipWriteScope,
  ctx: RequestContext,
  targetId: string,
): Promise<Locked> {
  const rows = await scope.membership.lockMembers({ callerId: ctx.userId, targetId });
  const admins = rows.filter((row) => row.role === TENANT_ADMIN);
  if (!admins.some((row) => row.userId === ctx.userId)) refuse('not_found');
  const target = rows.find((row) => row.userId === targetId) ?? refuse('not_found');
  return { target, admins: admins.length };
}

/** 3c: refuses when the change would leave the Tenant with no `tenant_admin`. */
function keepAnAdmin({ target, admins }: Locked): void {
  if (target.role === TENANT_ADMIN && admins <= 1) {
    refuse('invalid_input', { userId: [LAST_TENANT_ADMIN] });
  }
}

/** FR-3: revokes a membership — the row is deleted; the record keeps its role and Projects. */
export async function revokeMembership<Handle>(
  deps: MembershipWriteDeps<Handle>,
  ctx: RequestContext,
  input: RevokeMembershipInput,
): Promise<Result<void>> {
  return runRoleGatedWrite(
    revokeMembershipInputSchema,
    TENANT_ADMIN_ROLES,
    deps,
    ctx,
    input,
    async (scope, stamp, command) => {
    const locked = await lockCallerAndTarget(scope, ctx, command.userId);
    keepAnAdmin(locked);
    await scope.membership.deleteMembership(locked.target.userId);
    await audit.record(scope, stamp, 'membership.revoke', locked.target.userId, {
      before: { role: locked.target.role, projectIds: [...locked.target.projectIds] },
    });
  });
}

/**
 * Changes a member's role to `tenant_admin` or `pm`. The Projects are kept either way, so a PM
 * promoted and later demoted has theirs back. A member whose stored role is anything else (an
 * unknown string included) may be re-roled. The role it already has is a no-op.
 */
export async function changeMemberRole<Handle>(
  deps: MembershipWriteDeps<Handle>,
  ctx: RequestContext,
  input: ChangeMemberRoleInput,
): Promise<Result<void>> {
  return runRoleGatedWrite(
    changeMemberRoleInputSchema,
    TENANT_ADMIN_ROLES,
    deps,
    ctx,
    input,
    async (scope, stamp, command) => {
    const locked = await lockCallerAndTarget(scope, ctx, command.userId);
    if (command.role !== TENANT_ADMIN) keepAnAdmin(locked);
    if (locked.target.role === command.role) return;
    await scope.membership.setRole({ userId: locked.target.userId, role: command.role });
    await audit.record(scope, stamp, 'membership.change_role', locked.target.userId, {
      before: locked.target.role,
      after: command.role,
    });
  });
}

/**
 * Assigns a Project of this Tenant to a member (either role), appended once. A Project this Tenant
 * cannot see is `not_found`; one already held is a no-op.
 */
export async function assignMemberProject<Handle>(
  deps: MembershipWriteDeps<Handle>,
  ctx: RequestContext,
  input: AssignMemberProjectInput,
): Promise<Result<void>> {
  return runRoleGatedWrite(
    assignMemberProjectInputSchema,
    TENANT_ADMIN_ROLES,
    deps,
    ctx,
    input,
    async (scope, stamp, command) => {
    const { target } = await lockCallerAndTarget(scope, ctx, command.userId);
    const project = (await scope.org.findProject(command.projectId)) ?? refuse('not_found');
    if (target.projectIds.includes(project.id)) return;
    const after = [...target.projectIds, project.id];
    await scope.membership.setProjectIds({ userId: target.userId, projectIds: after });
    await audit.record(scope, stamp, 'membership.assign_project', target.userId, {
      before: [...target.projectIds],
      after,
    });
  });
}

/**
 * Removes a Project id from a member's Projects. The Project need not exist — a stale id whose
 * Project is gone is removed like any other. An id not held is a no-op.
 */
export async function unassignMemberProject<Handle>(
  deps: MembershipWriteDeps<Handle>,
  ctx: RequestContext,
  input: UnassignMemberProjectInput,
): Promise<Result<void>> {
  return runRoleGatedWrite(
    unassignMemberProjectInputSchema,
    TENANT_ADMIN_ROLES,
    deps,
    ctx,
    input,
    async (scope, stamp, command) => {
    const { target } = await lockCallerAndTarget(scope, ctx, command.userId);
    if (!target.projectIds.includes(command.projectId)) return;
    const after = target.projectIds.filter((projectId) => projectId !== command.projectId);
    await scope.membership.setProjectIds({ userId: target.userId, projectIds: after });
    await audit.record(scope, stamp, 'membership.unassign_project', target.userId, {
      before: [...target.projectIds],
      after,
    });
  });
}

/**
 * What each write above records, declared for the audit gate (`tests/audited-use-cases.test.ts`),
 * keyed by the use case's exported name.
 */
export const MEMBERSHIP_WRITE_AUDIT = {
  revokeMembership: { audited: ['membership.revoke'] },
  changeMemberRole: { audited: ['membership.change_role'] },
  assignMemberProject: { audited: ['membership.assign_project'] },
  unassignMemberProject: { audited: ['membership.unassign_project'] },
} as const satisfies Readonly<Record<string, AuditDeclaration>>;

/** Role declarations for the membership writes (colocated — see `role-declarations.ts`). */
export const MEMBERSHIP_WRITE_ROLES = {
  revokeMembership: ADMIN_ONLY,
  changeMemberRole: ADMIN_ONLY,
  assignMemberProject: ADMIN_ONLY,
  unassignMemberProject: ADMIN_ONLY,
} as const satisfies Readonly<Record<string, RoleDeclaration>>;
