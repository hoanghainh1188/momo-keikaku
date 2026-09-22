import type { z } from 'zod';
import { projectDate } from '@momo/domain';
import { audit, type AuditDeclaration } from '../audit';
import { authorize, TENANT_ADMIN_ROLES } from '../authz/authorize';
import type { RequestContext } from '../authz/request-context';
import type { NewProjectRow, OrgRepository, OrgWriteDeps, OrgWriteScope } from '../ports/org-write';
import type { WriteDeps } from '../ports/write-deps';
import type { WriteStamp } from '../ports/audited-write';
import type { Result } from '../result';
import { refuse, runAuditedWrite } from './audited-write';
import {
  createDepartmentInputSchema,
  createProgramInputSchema,
  createProjectInputSchema,
  reassignProjectDepartmentInputSchema,
  reassignProjectProgramInputSchema,
  renameDepartmentInputSchema,
  renameProgramInputSchema,
  renameProjectInputSchema,
  type CreateDepartmentInput,
  type CreateProgramInput,
  type CreateProjectInput,
  type ReassignProjectDepartmentInput,
  type ReassignProjectProgramInput,
  type RenameDepartmentInput,
  type RenameProgramInput,
  type RenameProjectInput,
} from './org-input';

/**
 * THE ORGANISATION WRITES — FR-1's Tenant › Department › Program › Project (story 1.3 slice 2).
 *
 * Every one is on NFR-A1's list ("creating, renaming or reassigning Departments, Programs and
 * Projects, each with the previous value"), so every one is AUDITED (AD-14): its change and its
 * `audit.record` happen inside the one tenant transaction `runAuditedWrite` opens, and the payload
 * carries `{ before, after }` wherever there is a previous value.
 *
 * The shared contract:
 *
 *   * `invalid_input` for a malformed command (a blank or NUL-bearing name, an empty id) — no
 *     transaction is opened; and for a well-formed command that breaks a rule — a Program that
 *     does not belong to the Project's owning Department — the transaction rolls back;
 *   * `not_found` for any Department, Program or Project the Tenant cannot see — it does not
 *     exist, or another Tenant owns it; never `forbidden`, so existence is not disclosed — and the
 *     transaction rolls back, so nothing lands for either Tenant;
 *   * `ok` once the change and its record have committed together — a create answering the new
 *     row's id (`{ id }`), so its caller can name what it made; the others answer nothing.
 *
 * The Tenant comes from `ctx` and nowhere else; the actor from `deps`. The audit `at` is the
 * `Clock`'s (an org change has no Project anchor to borrow). New rows take their ids from the
 * id port, so the id is known before the insert and the record names it as its target.
 *
 * Out of scope, by the slice's Never list: deleting or archiving an org unit, moving a Program
 * between Departments, a name-uniqueness rule. Role checks (story 1.5): every write declares
 * `tenant_admin` only — no Project check.
 */

/**
 * What a new Project is created with, for the columns later stories own. Documented here, in one
 * place, so the defaults are a decision somebody can read rather than values scattered through an
 * insert:
 *
 *   * `tzOffsetMinutes: 540` — JST, the product's default Project time zone (UX: "always in the
 *     Project time zone (default JST)");
 *   * `teireiWeekday: 1` — Monday (`0` is Sunday, as `calendar.ts`'s `weekday` counts), until the
 *     PM sets the teirei;
 *   * `defaultRateJpy: 0` — the dual-write cache of the Project default Rate head; `createProject`
 *     also inserts the first `project_default_rate_entry` at yen 0 (story 1.6). Live unpinned
 *     valuation reads this column; history and pinned lookups read the append-only table;
 *   * `eacMethod: 'typical'` — the only method the domain has;
 *   * `calendarJp: true, calendarVn: false` — the Japanese holiday calendar only, until the PM
 *     adds the offshore one.
 *
 * `demoAnchor` is not here: it is the Clock's `now` at creation (the fixture-mode clock of story
 * 1.8 makes that the demo's fixed instant).
 */
export const NEW_PROJECT_DEFAULTS = {
  tzOffsetMinutes: 540,
  teireiWeekday: 1,
  defaultRateJpy: 0,
  eacMethod: 'typical',
  calendarJp: true,
  calendarVn: false,
} as const satisfies Omit<
  NewProjectRow,
  'id' | 'name' | 'departmentId' | 'programId' | 'clientName' | 'contractType' | 'demoAnchor'
>;

/** What a create answers: the id the id port minted for the new row. */
export interface Created {
  readonly id: string;
}

/** Runs one org write: `tenant_admin` first, then the Clock stamps it; `refuse` inside `work` answers a code, rolled back. */
function runOrgWrite<Handle, Command, Value = void>(
  schema: z.ZodType<Command>,
  deps: OrgWriteDeps<Handle>,
  ctx: RequestContext,
  input: unknown,
  work: (scope: OrgWriteScope, stamp: WriteStamp, command: Command) => Promise<Value>,
): Promise<Result<Value>> {
  const gate = authorize(ctx, { roles: TENANT_ADMIN_ROLES });
  if (!gate.ok) return Promise.resolve(gate);
  return runAuditedWrite(schema, deps, ctx, input, { at: async () => deps.clock.now() }, work);
}

async function visibleDepartment(org: OrgRepository, departmentId: string) {
  return (await org.findDepartment(departmentId)) ?? refuse('not_found');
}

async function visibleProgram(org: OrgRepository, programId: string) {
  return (await org.findProgram(programId)) ?? refuse('not_found');
}

async function visibleProject(org: OrgRepository, projectId: string) {
  return (await org.findProject(projectId)) ?? refuse('not_found');
}

/**
 * The rule code an `invalid_input` names under `details.programId` when a Program is not one of
 * the Project's owning Department's. Declared once, here, so no caller spells it again.
 */
export const PROGRAM_NOT_IN_DEPARTMENT = 'program_not_in_department';

/**
 * THE RULE: a Program is accepted on a Project only if it belongs to the Project's owning
 * Department. Checked inside the transaction, against rows this Tenant can see — a Program it
 * cannot see is `not_found` first, never `invalid_input`, so a foreign Program's existence is not
 * disclosed by the difference.
 */
async function programFor(
  org: OrgRepository,
  programId: string | null,
  departmentId: string,
): Promise<string | null> {
  if (programId === null) return null;
  const program = await visibleProgram(org, programId);
  if (program.departmentId !== departmentId) {
    refuse('invalid_input', { programId: [PROGRAM_NOT_IN_DEPARTMENT] });
  }
  return program.id;
}

/** FR-1: a new Department in the caller's Tenant. */
export async function createDepartment<Handle>(
  deps: OrgWriteDeps<Handle>,
  ctx: RequestContext,
  input: CreateDepartmentInput,
): Promise<Result<Created>> {
  return runOrgWrite(createDepartmentInputSchema, deps, ctx, input, async (scope, stamp, command) => {
    const id = deps.ids.next();
    await scope.org.insertDepartment({ id, name: command.name });
    await audit.record(scope, stamp, 'department.create', id, { name: command.name });
    return { id };
  });
}

/** FR-1: renames a Department; the record carries the previous name. */
export async function renameDepartment<Handle>(
  deps: OrgWriteDeps<Handle>,
  ctx: RequestContext,
  input: RenameDepartmentInput,
): Promise<Result<void>> {
  return runOrgWrite(renameDepartmentInputSchema, deps, ctx, input, async (scope, stamp, command) => {
    const department = await visibleDepartment(scope.org, command.departmentId);
    await scope.org.renameDepartment({ id: department.id, name: command.name });
    await audit.record(scope, stamp, 'department.rename', department.id, {
      before: department.name,
      after: command.name,
    });
  });
}

/** FR-1: a new Program in one of the caller's Departments. A Program never changes Department. */
export async function createProgram<Handle>(
  deps: OrgWriteDeps<Handle>,
  ctx: RequestContext,
  input: CreateProgramInput,
): Promise<Result<Created>> {
  return runOrgWrite(createProgramInputSchema, deps, ctx, input, async (scope, stamp, command) => {
    const department = await visibleDepartment(scope.org, command.departmentId);
    const id = deps.ids.next();
    await scope.org.insertProgram({ id, departmentId: department.id, name: command.name });
    await audit.record(scope, stamp, 'program.create', id, {
      departmentId: department.id,
      name: command.name,
    });
    return { id };
  });
}

/** FR-1: renames a Program; the record carries the previous name. */
export async function renameProgram<Handle>(
  deps: OrgWriteDeps<Handle>,
  ctx: RequestContext,
  input: RenameProgramInput,
): Promise<Result<void>> {
  return runOrgWrite(renameProgramInputSchema, deps, ctx, input, async (scope, stamp, command) => {
    const program = await visibleProgram(scope.org, command.programId);
    await scope.org.renameProgram({ id: program.id, name: command.name });
    await audit.record(scope, stamp, 'program.rename', program.id, {
      before: program.name,
      after: command.name,
    });
  });
}

/**
 * FR-1: a new Project — its name, owning Department, optional Program (only one of that
 * Department's), client name and contract type. Every other column takes `NEW_PROJECT_DEFAULTS`,
 * and `demo_anchor` the Clock's `now`. The first `project_default_rate_entry` is inserted at
 * yen 0 (dual-write with the column head) so the Rate history starts with the Project (story 1.6).
 * The record carries every column the row was created with (the anchor as an ISO instant), not
 * only the ones the caller supplied.
 *
 * Takes `WriteDeps` (not only `OrgWriteDeps`) so the first default Rate lands through the
 * Resource/Rate repository on the same transaction.
 */
export async function createProject<Handle>(
  deps: WriteDeps<Handle>,
  ctx: RequestContext,
  input: CreateProjectInput,
): Promise<Result<Created>> {
  const gate = authorize(ctx, { roles: TENANT_ADMIN_ROLES });
  if (!gate.ok) return Promise.resolve(gate);
  return runAuditedWrite(
    createProjectInputSchema,
    deps,
    ctx,
    input,
    { at: async () => deps.clock.now() },
    async (scope, stamp, command) => {
      const department = await visibleDepartment(scope.org, command.departmentId);
      const programId = await programFor(scope.org, command.programId, department.id);
      const id = deps.ids.next();
      const row: NewProjectRow = {
        id,
        name: command.name,
        departmentId: department.id,
        programId,
        clientName: command.clientName,
        contractType: command.contractType,
        ...NEW_PROJECT_DEFAULTS,
        demoAnchor: stamp.at,
      };
      await scope.org.insertProject(row);
      // First default Rate at yen 0 — same head as the column; history starts with the Project.
      await scope.resources.appendProjectDefaultRate({
        projectId: id,
        effectiveFrom: projectDate(
          stamp.at.toISOString(),
          NEW_PROJECT_DEFAULTS.tzOffsetMinutes,
        ),
        yenPerHour: NEW_PROJECT_DEFAULTS.defaultRateJpy,
      });
      // Everything the row was created with — the defaulted columns and the anchor included — so
      // the record alone says what the Project started as. The id is the record's target.
      const { id: _target, demoAnchor, ...created } = row;
      await audit.record(scope, stamp, 'project.create', id, {
        ...created,
        demoAnchor: demoAnchor.toISOString(),
      });
      return { id };
    },
  );
}

/** FR-1: renames a Project; the record carries the previous name. */
export async function renameProject<Handle>(
  deps: OrgWriteDeps<Handle>,
  ctx: RequestContext,
  input: RenameProjectInput,
): Promise<Result<void>> {
  return runOrgWrite(renameProjectInputSchema, deps, ctx, input, async (scope, stamp, command) => {
    const project = await visibleProject(scope.org, command.projectId);
    await scope.org.renameProject({ id: project.id, name: command.name });
    await audit.record(scope, stamp, 'project.rename', project.id, {
      before: project.name,
      after: command.name,
    });
  });
}

/**
 * FR-1: moves a Project to another of its Department's Programs, or out of any (`null`).
 *
 * ROLL-UP ONLY. It changes the Project's `program_id` and nothing else: no Baseline, ledger
 * entry, Mapping, snapshot or earlier audit row moves (the write harness proves it table by
 * table), because a Program is a grouping for reporting, not part of how a Project's figures are
 * computed.
 */
export async function reassignProjectProgram<Handle>(
  deps: OrgWriteDeps<Handle>,
  ctx: RequestContext,
  input: ReassignProjectProgramInput,
): Promise<Result<void>> {
  return runOrgWrite(
    reassignProjectProgramInputSchema,
    deps,
    ctx,
    input,
    async (scope, stamp, command) => {
      const project = await visibleProject(scope.org, command.projectId);
      const programId = await programFor(scope.org, command.programId, project.departmentId);
      await scope.org.setProjectProgram({ id: project.id, programId });
      await audit.record(scope, stamp, 'project.reassign_program', project.id, {
        before: project.programId,
        after: programId,
      });
    },
  );
}

/**
 * FR-1: moves a Project to another owning Department. Its Program must be cleared (`null`) or
 * replaced by one of the NEW Department's in the same change — naming a Program of any other
 * Department, the Project's current one included, is `invalid_input` and nothing lands.
 */
export async function reassignProjectDepartment<Handle>(
  deps: OrgWriteDeps<Handle>,
  ctx: RequestContext,
  input: ReassignProjectDepartmentInput,
): Promise<Result<void>> {
  return runOrgWrite(
    reassignProjectDepartmentInputSchema,
    deps,
    ctx,
    input,
    async (scope, stamp, command) => {
      const project = await visibleProject(scope.org, command.projectId);
      const department = await visibleDepartment(scope.org, command.departmentId);
      const programId = await programFor(scope.org, command.programId, department.id);
      await scope.org.setProjectDepartment({ id: project.id, departmentId: department.id, programId });
      await audit.record(scope, stamp, 'project.reassign_department', project.id, {
        before: { departmentId: project.departmentId, programId: project.programId },
        after: { departmentId: department.id, programId },
      });
    },
  );
}

/**
 * What each write above records, declared for the audit gate (`tests/audited-use-cases.test.ts`),
 * keyed by the use case's exported name.
 */
export const ORG_WRITE_AUDIT = {
  createDepartment: { audited: ['department.create'] },
  renameDepartment: { audited: ['department.rename'] },
  createProgram: { audited: ['program.create'] },
  renameProgram: { audited: ['program.rename'] },
  createProject: { audited: ['project.create'] },
  renameProject: { audited: ['project.rename'] },
  reassignProjectProgram: { audited: ['project.reassign_program'] },
  reassignProjectDepartment: { audited: ['project.reassign_department'] },
} as const satisfies Readonly<Record<string, AuditDeclaration>>;
