/**
 * The port the Tenant-Admin organisation list readers depend on (story 2.17).
 *
 * DECLARED HERE, SATISFIED STRUCTURALLY by `packages/db/src/repo-org-list.ts` at the composition
 * root — same pattern as `audit-log-read.ts`. List SELECTs only; the FOR UPDATE finders in
 * `repo-org.ts` stay write-side.
 */
/** One Department row for the admin list. */
export interface DepartmentListRow {
  readonly id: string;
  readonly name: string;
}

/** One Program row with the owning Department named so the Admin can act. */
export interface ProgramListRow {
  readonly id: string;
  readonly departmentId: string;
  readonly departmentName: string;
  readonly name: string;
}

/** One Project row with parent Department / Program names for reassignment forms. */
export interface ProjectListRow {
  readonly id: string;
  readonly name: string;
  readonly departmentId: string;
  readonly departmentName: string;
  readonly programId: string | null;
  readonly programName: string | null;
}

export interface OrgReadPort<Handle> {
  readonly listDepartments: (
    handle: Handle,
    tenantId: string,
  ) => Promise<readonly DepartmentListRow[]>;
  readonly listPrograms: (handle: Handle, tenantId: string) => Promise<readonly ProgramListRow[]>;
  readonly listProjects: (handle: Handle, tenantId: string) => Promise<readonly ProjectListRow[]>;
}

/** What the organisation list read use cases are given. */
export interface OrgReadDeps<Handle> {
  readonly handle: Handle;
  readonly orgRead: OrgReadPort<Handle>;
}
