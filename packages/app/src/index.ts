// `packages/app` is the application layer: use cases, ports, RequestContext,
// authorisation, audit and configuration. Inbound adapters (`apps/web`,
// `apps/worker`) may call only what this barrel exposes.
//
// Story 1.2 slice 3 brings the first use cases: the two project reads, the port they depend
// on, and the `Result` they return. Slice 4 adds the five project writes and their port. The
// web → domain/present edge (2026-09-21) adds the Client View and Mapping reads, so no page
// computes from the domain.
// Story 1.3 slice 1 adds the audit mechanism (`./audit`) and the tenant transaction the writes
// run in; slice 2 generalises the write deps (`AuditedWriteDeps`, `WriteDeps`), adds the Clock and
// id ports, and the eight organisation writes. Authorisation (1.5) and the RequestContext (1.4)
// attach to this layer later.
//
// `./use-cases` does not import `./config`, so code that needs the use cases and not the
// configuration can import `packages/app/src/use-cases` directly. `config` is lazy (a getter
// per key), so importing this barrel reads no environment either.
//
// The result and port modules cross this barrel as TYPES only. Their runtime helpers — `ok`,
// `fail`, `isProjectNotFound`, the message-key table — are how a use case builds its answer,
// and an inbound adapter that could call them could fabricate one.
export * from './config';
export type { AppError, AppErrorCode, AppErrorMessageKey, Result } from './result';
export type {
  ProjectBundle,
  ProjectReadDeps,
  ProjectReadPort,
  ProjectReview,
} from './ports/project-read';
export type {
  ChangeRequestCandidateCommand,
  ExplainDispositionCommand,
  ManualMappingCommand,
  MapDispositionCommand,
  PlanDispositionCommand,
  ProjectWriteDeps,
  ProjectWriteRepository,
  ProjectWriteScope,
} from './ports/project-write';
export type { AuditedWriteDeps, WriteStamp } from './ports/audited-write';
export type { Clock } from './ports/clock';
export type { IdGenerator } from './ports/ids';
export type {
  DepartmentRow,
  NewProjectRow,
  OrgRepository,
  OrgWriteDeps,
  OrgWriteScope,
  ProgramRow,
  ProjectPlacementRow,
} from './ports/org-write';
export type { WriteDeps, WriteScope } from './ports/write-deps';
export type { Created } from './use-cases/org-writes';
export type { TenantTransaction } from './ports/tenant-transaction';
// Audit crosses as TYPES only, like the result and the ports: `audit.record` is a use case's to
// call inside its own transaction, never an inbound adapter's.
export type { AuditAction, AuditEntry, AuditSink } from './audit';
export * from './use-cases';
export type { UseCaseContext } from './use-cases/context';
export type { ClientView } from './use-cases/get-client-view';
export type {
  MappingRuleRow,
  MappingTicketRow,
  MappingWorkPackage,
  ProjectMapping,
} from './use-cases/get-project-mapping';
export type { ProjectInput } from './use-cases/project-input';
// The one runtime value besides the use cases and `config`: the Explain note's length bound,
// so the action's truncation and the use case's validation cannot drift apart.
export { EXPLAIN_NOTE_MAX } from './use-cases/project-write-input';
export type {
  ChangeRequestCandidatesInput,
  ExplainTicketsInput,
  MapTicketInput,
  MapTicketsInput,
  PlanTicketsInput,
} from './use-cases/project-write-input';
export type {
  CreateDepartmentInput,
  CreateProgramInput,
  CreateProjectInput,
  ReassignProjectDepartmentInput,
  ReassignProjectProgramInput,
  RenameDepartmentInput,
  RenameProgramInput,
  RenameProjectInput,
} from './use-cases/org-input';
