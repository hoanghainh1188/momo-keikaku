import type { z } from 'zod';
import { audit, type AuditDeclaration } from '../audit';
import { authorize, STAFF_RESOURCE_ROLES, TENANT_ADMIN_ROLES } from '../authz/authorize';
import type { RequestContext } from '../authz/request-context';
import type {
  ResourceWriteDeps,
  ResourceWriteScope,
} from '../ports/resource-write';
import type { WriteStamp } from '../ports/audited-write';
import type { Result } from '../result';
import { refuse, runAuditedWrite } from './audited-write';
import {
  appendProjectDefaultRateInputSchema,
  appendResourceRateInputSchema,
  createResourceInputSchema,
  type AppendProjectDefaultRateInput,
  type AppendResourceRateInput,
  type CreateResourceInput,
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

function runResourceWrite<Handle, Command, Value = void>(
  schema: z.ZodType<Command>,
  roles: readonly ('tenant_admin' | 'pm')[],
  deps: ResourceWriteDeps<Handle>,
  ctx: RequestContext,
  input: unknown,
  work: (scope: ResourceWriteScope, stamp: WriteStamp, command: Command) => Promise<Value>,
): Promise<Result<Value>> {
  const gate = authorize(ctx, { roles });
  if (!gate.ok) return Promise.resolve(gate);
  return runAuditedWrite(schema, deps, ctx, input, { at: async () => deps.clock.now() }, work);
}

/** FR-12: a new Resource in an own Department — no Rate row. */
export async function createResource<Handle>(
  deps: ResourceWriteDeps<Handle>,
  ctx: RequestContext,
  input: CreateResourceInput,
): Promise<Result<CreatedResource>> {
  return runResourceWrite(
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
  return runResourceWrite(
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
  return runResourceWrite(
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

export const RESOURCE_WRITE_AUDIT = {
  createResource: { audited: ['resource.create'] },
  appendResourceRate: { audited: ['rate.append'] },
  appendProjectDefaultRate: { audited: ['project_default_rate.append'] },
} as const satisfies Readonly<Record<string, AuditDeclaration>>;
