import { ADMIN_ONLY, STAFF_RESOURCE, type RoleDeclaration } from '../authz/authorize';
import type { z } from 'zod';
import { audit, type AuditDeclaration } from '../audit';
import { STAFF_RESOURCE_ROLES, TENANT_ADMIN_ROLES } from '../authz/authorize';
import type { RequestContext } from '../authz/request-context';
import type {
  ResourceWriteDeps,
  ResourceWriteScope,
} from '../ports/resource-write';
import type { WriteStamp } from '../ports/audited-write';
import type { Result } from '../result';
import { refuse, runRoleGatedWrite } from './audited-write';
import {
  appendProjectDefaultRateInputSchema,
  appendResourceRateInputSchema,
  createResourceInputSchema,
  linkTrackerAccountInputSchema,
  unlinkTrackerAccountInputSchema,
  type AppendProjectDefaultRateInput,
  type AppendResourceRateInput,
  type CreateResourceInput,
  type LinkTrackerAccountInput,
  type UnlinkTrackerAccountInput,
} from './resource-input';

/**
 * RESOURCE AND RATE WRITES (story 1.6, FR-12).
 *
 *   * `createResource` — `tenant_admin` | `pm`, no Project check: inserts a Resource in an own
 *     Department with empty Rate history (valuation falls back to the Project default).
 *   * `appendResourceRate` / `appendProjectDefaultRate` — `tenant_admin` only. Rates are
 *     append-only; a retroactive append leaves the Actuals Ledger untouched. The Project default
 *     append also updates `project.default_rate_jpy` to the new head (dual-write cache).
 *
 * Refusal: `not_found` for a foreign or missing Department / Resource / Project; `invalid_input`
 * for blank/NUL names or a negative yen (role-allowed callers only — role is checked before parse).
 */

/** What a create answers: the id the id port minted. */
export interface CreatedResource {
  readonly id: string;
}

/** FR-12: a new Resource in an own Department — no Rate row. */
export async function createResource<Handle>(
  deps: ResourceWriteDeps<Handle>,
  ctx: RequestContext,
  input: CreateResourceInput,
): Promise<Result<CreatedResource>> {
  return runRoleGatedWrite(
    createResourceInputSchema,
    STAFF_RESOURCE_ROLES,
    deps,
    ctx,
    input,
    async (scope, stamp, command) => {
      const department = await scope.resources.findDepartment(command.departmentId);
      if (!department) refuse('not_found');
      const id = deps.ids.next();
      await scope.resources.insertResource({
        id,
        departmentId: department.id,
        name: command.name,
        role: command.role,
      });
      await audit.record(scope, stamp, 'resource.create', id, {
        departmentId: department.id,
        name: command.name,
        role: command.role,
      });
      return { id };
    },
  );
}

/** FR-12: append a dated Rate for a Resource. Admin only; ledger untouched. */
export async function appendResourceRate<Handle>(
  deps: ResourceWriteDeps<Handle>,
  ctx: RequestContext,
  input: AppendResourceRateInput,
): Promise<Result<void>> {
  return runRoleGatedWrite(
    appendResourceRateInputSchema,
    TENANT_ADMIN_ROLES,
    deps,
    ctx,
    input,
    async (scope, stamp, command) => {
      const resource = await scope.resources.findResource(command.resourceId);
      if (!resource) refuse('not_found');
      await scope.resources.appendResourceRate({
        resourceId: resource.id,
        effectiveFrom: command.effectiveFrom,
        yenPerHour: command.yenPerHour,
      });
      await audit.record(scope, stamp, 'rate.append', resource.id, {
        effectiveFrom: command.effectiveFrom,
        yenPerHour: command.yenPerHour,
      });
    },
  );
}

/**
 * FR-12: append a dated Project default Rate and dual-write the column head. Admin only.
 * `createProject` uses the same repository member for the first row at yen 0.
 */
export async function appendProjectDefaultRate<Handle>(
  deps: ResourceWriteDeps<Handle>,
  ctx: RequestContext,
  input: AppendProjectDefaultRateInput,
): Promise<Result<void>> {
  return runRoleGatedWrite(
    appendProjectDefaultRateInputSchema,
    TENANT_ADMIN_ROLES,
    deps,
    ctx,
    input,
    async (scope, stamp, command) => {
      const project = await scope.resources.findProject(command.projectId);
      if (!project) refuse('not_found');
      await scope.resources.appendProjectDefaultRate({
        projectId: project.id,
        effectiveFrom: command.effectiveFrom,
        yenPerHour: command.yenPerHour,
      });
      await audit.record(scope, stamp, 'project_default_rate.append', project.id, {
        effectiveFrom: command.effectiveFrom,
        yenPerHour: command.yenPerHour,
      });
    },
  );
}

/**
 * Story 5.8 / FR-13: append a Tracker Account → Resource link (or change). Dual-writes the
 * live `tracker_account_ids` cache. PM + tenant_admin (same staff resource gate as create).
 */
export async function linkTrackerAccount<Handle>(
  deps: ResourceWriteDeps<Handle>,
  ctx: RequestContext,
  input: LinkTrackerAccountInput,
): Promise<Result<{ seq: number }>> {
  return runRoleGatedWrite(
    linkTrackerAccountInputSchema,
    STAFF_RESOURCE_ROLES,
    deps,
    ctx,
    input,
    async (scope, stamp, command) => {
      const account = await scope.resources.findTrackerAccount(command.trackerAccountId);
      if (!account) refuse('not_found');
      const resource = await scope.resources.findResource(command.resourceId);
      if (!resource) refuse('not_found');
      const seq = await scope.resources.appendTrackerAccountLink({
        trackerAccountId: account.id,
        accountId: account.accountId,
        resourceId: resource.id,
        actor: stamp.actor,
        at: stamp.at,
      });
      await audit.record(scope, stamp, 'tracker_account.link', account.id, {
        resourceId: resource.id,
        accountId: account.accountId,
      });
      return { seq };
    },
  );
}

/**
 * Story 5.8 / FR-13: unlink — append `resource_id = null`. Hours become Unattributed.
 */
export async function unlinkTrackerAccount<Handle>(
  deps: ResourceWriteDeps<Handle>,
  ctx: RequestContext,
  input: UnlinkTrackerAccountInput,
): Promise<Result<{ seq: number }>> {
  return runRoleGatedWrite(
    unlinkTrackerAccountInputSchema,
    STAFF_RESOURCE_ROLES,
    deps,
    ctx,
    input,
    async (scope, stamp, command) => {
      const account = await scope.resources.findTrackerAccount(command.trackerAccountId);
      if (!account) refuse('not_found');
      const seq = await scope.resources.appendTrackerAccountLink({
        trackerAccountId: account.id,
        accountId: account.accountId,
        resourceId: null,
        actor: stamp.actor,
        at: stamp.at,
      });
      await audit.record(scope, stamp, 'tracker_account.unlink', account.id, {
        accountId: account.accountId,
      });
      return { seq };
    },
  );
}

export const RESOURCE_WRITE_AUDIT = {
  createResource: { audited: ['resource.create'] },
  appendResourceRate: { audited: ['rate.append'] },
  appendProjectDefaultRate: { audited: ['project_default_rate.append'] },
} as const satisfies Readonly<Record<string, AuditDeclaration>>;

/**
 * Story 5.8 link writers — off the use-cases barrel (like `confirmConnectorOwnership`).
 * Composition + unit tests import them; the cross-tenant / audit-surface gates do not drive them.
 */
export const TRACKER_ACCOUNT_LINK_AUDIT = {
  linkTrackerAccount: { audited: ['tracker_account.link'] },
  unlinkTrackerAccount: { audited: ['tracker_account.unlink'] },
} as const satisfies Readonly<Record<string, AuditDeclaration>>;

/** Role declarations for the Resource / Rate writes (colocated — see `role-declarations.ts`). */
export const RESOURCE_WRITE_ROLES = {
  createResource: STAFF_RESOURCE,
  appendResourceRate: ADMIN_ONLY,
  appendProjectDefaultRate: ADMIN_ONLY,
} as const satisfies Readonly<Record<string, RoleDeclaration>>;

export const TRACKER_ACCOUNT_LINK_ROLES = {
  linkTrackerAccount: STAFF_RESOURCE,
  unlinkTrackerAccount: STAFF_RESOURCE,
} as const satisfies Readonly<Record<string, RoleDeclaration>>;
