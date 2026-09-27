// NOTE: `fixtures.ts` is deliberately NOT re-exported here. It reads the fixture
// files from disk and is only used by the seed and the tests; keeping it out of
// this barrel keeps the Next.js server bundle free of filesystem globbing.
//
// `seed.ts` is not here either, for the same reason and one more: its composition root is
// `scripts/seed.ts`, and nothing in an application should be able to truncate the database
// by importing a barrel.
//
// `probe-tenants.ts` is in that same category — it writes and deletes whole Tenants for the
// cross-tenant harness, and is imported by `tests/cross-tenant.test.ts` by path and by
// nothing else. (The harness and its registry lived in this package until story 1.2 slice 3
// moved them to the root `tests/` directory, beside the use cases they now enumerate.)
export * from './client';
export * from './schema';
export * from './repo';
export { listAuditLog } from './repo-audit';
export type { AuditLogListFilters, AuditLogListedRow } from './repo-audit';
export { listDepartments, listPrograms, listProjects } from './repo-org-list';
export type {
  DepartmentListedRow,
  ProgramListedRow,
  ProjectListedRow,
} from './repo-org-list';
// The write side crosses as the tenant transaction and TYPES only: the repository builders
// (`projectWriteRepositoryOn`, `orgRepositoryOn`) are reachable only through the scope
// `inTenantTransaction` binds to one transaction, never as free functions a caller could run on a
// handle of its own.
export type {
  ChangeRequestCandidateCommand,
  ExplainDispositionCommand,
  ManualMappingCommand,
  MapDispositionCommand,
  PlanDispositionCommand,
  WriteStamp,
} from './repo-writes';
export type { DepartmentRow, NewProjectRow, ProgramRow, ProjectPlacementRow } from './repo-org';
export { inTenantTransaction, type WriteScope } from './tenant-transaction';
// The membership bridge crosses as its ONE READER (story 1.4 slice 1), never as its Drizzle table:
// `tenantMembership` lives in `schema-membership.ts`, which this barrel deliberately does not
// re-export, so the only way an application reaches the table is `membershipsOf` — and the only
// caller of that is `resolveRequestContext`, through the composition root.
export { membershipsOf, type MembershipRow } from './repo-membership';
// …and its ONE WRITER (story 1.4 slice 2) crosses the way the other write repositories do: as a
// type only. `membershipWriterOn` is reachable solely through the scope `inTenantTransaction` binds.
export type { LockedMemberRow } from './repo-membership-write';
// `identity_event`'s one writer (story 1.4 slice 4) crosses as a RUNTIME VALUE, unlike the
// membership writer above: the table is global (no Tenant, no tenant transaction to fold it into),
// so the composition root calls it directly and hands the result to `createAuth` as
// `identityEvents`. `source-discipline.test.ts` pins that this barrel and the composition root are
// its only callers besides its own definition.
export {
  identityEventWriterOn,
  type IdentityEventAction,
  type IdentityEventRecord,
} from './repo-identity-event';
export { tenantCurrencyOn } from './repo-tenant-currency';
export * from './table-classes';
export * from './with-tenant';
