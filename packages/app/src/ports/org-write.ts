import type { AuditSink } from '../audit';
import type { AuditedWriteDeps } from './audited-write';
import type { Clock } from './clock';
import type { IdGenerator } from './ids';

/**
 * The port the organisation writes depend on — FR-1's Tenant › Department › Program › Project,
 * created, renamed and reassigned (story 1.3 slice 2).
 *
 * DECLARED HERE, SATISFIED STRUCTURALLY, like `ProjectWriteRepository`: `packages/db` may not
 * import `@momo/app`, so `packages/db/src/repo-org.ts` is shaped to match and the composition
 * roots' `satisfies` checks it. Members are function-typed PROPERTIES so their parameters are
 * checked strictly.
 *
 * BOUND TO ONE TRANSACTION AND ONE TENANT. Every member issues its statements on the scope's
 * transaction, under that Tenant's row-level security, and opens none of its own. So a `find*`
 * that answers `null` means "this Tenant cannot see it" — it does not exist, or another Tenant
 * owns it; row-level security makes those one event — and the use case answers `not_found`.
 *
 * The rules — a Program only within the Project's owning Department, the previous value in the
 * audit payload, the defaults a new Project takes — are the use cases' (`use-cases/org-writes.ts`),
 * not the repository's: it reads and writes rows, and decides nothing.
 */

export interface DepartmentRow {
  readonly id: string;
  readonly name: string;
}

export interface ProgramRow {
  readonly id: string;
  readonly departmentId: string;
  readonly name: string;
}

/** The part of a Project the organisation writes read: its name and where it sits. */
export interface ProjectPlacementRow {
  readonly id: string;
  readonly name: string;
  readonly departmentId: string;
  readonly programId: string | null;
}

/**
 * A new Project, every column spelled out. The columns later stories own (time zone, teirei,
 * default rate, EAC method, calendars, the demo anchor) arrive filled with the documented
 * defaults (`NEW_PROJECT_DEFAULTS` in `use-cases/org-writes.ts`), so the repository inserts what
 * it is given and invents nothing.
 */
export interface NewProjectRow extends ProjectPlacementRow {
  readonly clientName: string;
  readonly contractType: '請負' | '準委任';
  readonly tzOffsetMinutes: number;
  readonly teireiWeekday: number;
  readonly defaultRateJpy: number;
  readonly eacMethod: 'typical';
  readonly calendarJp: boolean;
  readonly calendarVn: boolean;
  readonly demoAnchor: Date;
}

export interface OrgRepository {
  /** The Department, or `null` when this Tenant cannot see it. LOCKS the row, as below. */
  readonly findDepartment: (id: string) => Promise<DepartmentRow | null>;
  /** The Program, or `null` when this Tenant cannot see it. LOCKS the row, as below. */
  readonly findProgram: (id: string) => Promise<ProgramRow | null>;
  /**
   * The Project's placement, or `null` when this Tenant cannot see it. LOCKS the row for the
   * rest of the transaction, so two reassignments of one Project cannot both check the
   * Program/Department rule against the same stale placement.
   */
  readonly findProject: (id: string) => Promise<ProjectPlacementRow | null>;
  readonly insertDepartment: (row: DepartmentRow) => Promise<void>;
  readonly renameDepartment: (change: { readonly id: string; readonly name: string }) => Promise<void>;
  readonly insertProgram: (row: ProgramRow) => Promise<void>;
  readonly renameProgram: (change: { readonly id: string; readonly name: string }) => Promise<void>;
  readonly insertProject: (row: NewProjectRow) => Promise<void>;
  readonly renameProject: (change: { readonly id: string; readonly name: string }) => Promise<void>;
  /** Changes `program_id` and nothing else — no other column, no other table. */
  readonly setProjectProgram: (change: {
    readonly id: string;
    readonly programId: string | null;
  }) => Promise<void>;
  /** Changes `department_id` and `program_id` together, in one statement. */
  readonly setProjectDepartment: (change: {
    readonly id: string;
    readonly departmentId: string;
    readonly programId: string | null;
  }) => Promise<void>;
}

/** What one organisation write transaction hands its work: the repository and the audit sink. */
export interface OrgWriteScope {
  readonly org: OrgRepository;
  readonly audit: AuditSink;
}

/**
 * What an organisation write use case is given: the generic audited-write deps over its scope,
 * plus the `Clock` its audit `at` comes from (an org change has no Project anchor to borrow) and
 * the id port new rows take their ids from. All chosen by the composition root.
 */
export type OrgWriteDeps<Handle> = AuditedWriteDeps<Handle, OrgWriteScope> & {
  readonly clock: Clock;
  readonly ids: IdGenerator;
};
