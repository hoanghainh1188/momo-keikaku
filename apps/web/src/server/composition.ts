/**
 * `apps/web`'s COMPOSITION ROOT — and the only file under `apps/web` permitted to import
 * `@momo/db` or `@momo/adapters`. `.dependency-cruiser.cjs` (rules `apps-not-to-db` and
 * `apps-adapters-only-from-composition-root`) names this exact path, and `pnpm depcruise` fails CI
 * on any other `apps/*` file importing `packages/db`, `packages/adapters` or Drizzle.
 *
 * AD-1 says an inbound adapter may call use cases and nothing else. Something still has to
 * build the database handle, pick the role, and hand `packages/db`'s repository to
 * `packages/app`'s use cases as the ports they declare — and that something is this file,
 * named, so the rule allows exactly this path rather than a pattern. It is AD-1's second
 * carve-out beside `packages/db/auth` (ARCHITECTURE-SPINE.md, amended 2026-09-21).
 *
 * WHAT IT WIRES:
 *
 *   * The handle, on the restricted `momo_app` role — not the owner. `FORCE ROW LEVEL
 *     SECURITY` does nothing against a superuser (measured 2026-09-20), so a web app on the
 *     owner's credential would make every policy inert. `@momo/db` cannot read the
 *     configuration itself (the environment fence, and it may not import `@momo/app`), so
 *     the connection string is read here and passed in.
 *   * The ports. `packages/db`'s functions are handed over as they are: `packages/app`
 *     declares `ProjectReadPort` and the write deps' `TenantTransaction` (whose scope carries
 *     every write repository family and the audit sink, all bound to one transaction), and
 *     these functions satisfy them STRUCTURALLY. The two `satisfies` below are where
 *     TypeScript checks that match — change a signature on either side and the typecheck names
 *     the line.
 *   * The outbound adapters (story 1.3 slice 2): the `Clock` the organisation writes stamp their
 *     audit `at` with (`systemClock`) and the UUIDv7 id port new rows take their ids from, both
 *     from `packages/adapters` (AD-1, amended for this edge: the composition root alone).
 *   * The context: `{ tenantId }`, story 1.4's shape with one field, and — beside it — the
 *     audit ACTOR the writes stamp. There is no auth yet, so the single seeded Tenant and the
 *     single demo user are stated here, once each. `resolveRequestContext` replaces both
 *     lines together when it lands.
 *
 * WHAT IT EXPORTS: use-case bindings, and nothing else — never the handle, the Tenant, a
 * repository function or a Drizzle schema (AD-1). It wires; it never queries.
 */
import {
  config,
  createDepartment as createDepartmentUseCase,
  createProgram as createProgramUseCase,
  createProject as createProjectUseCase,
  explainTickets as explainTicketsUseCase,
  getClientView as getClientViewUseCase,
  getProjectHeader as getProjectHeaderUseCase,
  getProjectMapping as getProjectMappingUseCase,
  getProjectReview as getProjectReviewUseCase,
  mapTicket as mapTicketUseCase,
  mapTickets as mapTicketsUseCase,
  markChangeRequestCandidates as markChangeRequestCandidatesUseCase,
  planTicketsAsWorkPackage as planTicketsAsWorkPackageUseCase,
  reassignProjectDepartment as reassignProjectDepartmentUseCase,
  reassignProjectProgram as reassignProjectProgramUseCase,
  renameDepartment as renameDepartmentUseCase,
  renameProgram as renameProgramUseCase,
  renameProject as renameProjectUseCase,
  type ChangeRequestCandidatesInput,
  type CreateDepartmentInput,
  type CreateProgramInput,
  type CreateProjectInput,
  type ExplainTicketsInput,
  type MapTicketInput,
  type MapTicketsInput,
  type PlanTicketsInput,
  type ProjectInput,
  type ProjectReadDeps,
  type ReassignProjectDepartmentInput,
  type ReassignProjectProgramInput,
  type RenameDepartmentInput,
  type RenameProgramInput,
  type RenameProjectInput,
  type UseCaseContext,
  type WriteDeps,
} from '@momo/app';
import { systemClock, uuidV7IdsOn } from '@momo/adapters';
import {
  DEMO_TENANT_ID,
  getDb,
  inTenantTransaction,
  loadProjectBundle,
  loadReview,
  type Db,
} from '@momo/db';

/** The handle, on the restricted application role. Pools are memoised inside `getDb`. */
function webDb(): Db {
  return getDb(config.APP_DATABASE_URL);
}

/** The Tenant every request in this release belongs to. Story 1.4 resolves it per request. */
const WEB_TENANT_ID = DEMO_TENANT_ID;

/**
 * The audit actor every write in this release is stamped with — the demo's single PM. Stated
 * here, beside the Tenant, so neither `packages/db` nor the use cases name a user; story 1.4
 * replaces it with the signed-in user on the RequestContext.
 */
const WEB_ACTOR = 'user:linh';

/** The context every use case is called with. Story 1.4 resolves this per request. */
function webContext(): UseCaseContext {
  return { tenantId: WEB_TENANT_ID };
}

/**
 * The project read port, wired. Built per call rather than at module load, so importing this
 * file reads no configuration — `next build` evaluates route modules without a database.
 */
function projectReadDeps() {
  return {
    handle: webDb(),
    projectRead: { loadProjectBundle, loadReview },
  } satisfies ProjectReadDeps<Db>;
}

/** The Project bundle, for the project frame. See `packages/app`'s `getProjectHeader`. */
export function getProjectHeader(input: ProjectInput) {
  return getProjectHeaderUseCase(projectReadDeps(), webContext(), input);
}

/** The bundle and its Review, for every project page. See `packages/app`'s `getProjectReview`. */
export function getProjectReview(input: ProjectInput) {
  return getProjectReviewUseCase(projectReadDeps(), webContext(), input);
}

/** The Mapping surface, joined and ordered. See `packages/app`'s `getProjectMapping`. */
export function getProjectMapping(input: ProjectInput) {
  return getProjectMappingUseCase(projectReadDeps(), webContext(), input);
}

/** The client projection, default visibility. See `packages/app`'s `getClientView`. */
export function getClientView(input: ProjectInput) {
  return getClientViewUseCase(projectReadDeps(), webContext(), input);
}

/**
 * The one id generator for the process. Module-scoped because it keeps UUIDv7's monotonic state
 * (ids minted in one Clock millisecond must still sort by creation), which a per-call generator
 * would reset. Building it reads no configuration, so importing this file still reads nothing.
 */
const webIds = uuidV7IdsOn(systemClock);

/**
 * The write deps, wired: the one tenant transaction every write use case runs its change and its
 * audit record in (AD-14), the Clock and the id port. One value for every write — it satisfies
 * the project writes' deps and the organisation writes' alike. Built per call, for the same
 * reason as the read port (the id generator inside it is the process's one, above).
 */
function writeDeps() {
  return {
    handle: webDb(),
    actor: WEB_ACTOR,
    clock: systemClock,
    ids: webIds,
    transaction: inTenantTransaction,
  } satisfies WriteDeps<Db>;
}

/** FR-29 *Map*. See `packages/app`'s `mapTickets`. */
export function mapTickets(input: MapTicketsInput) {
  return mapTicketsUseCase(writeDeps(), webContext(), input);
}

/** FR-29 *Plan*. See `packages/app`'s `planTicketsAsWorkPackage`. */
export function planTicketsAsWorkPackage(input: PlanTicketsInput) {
  return planTicketsAsWorkPackageUseCase(writeDeps(), webContext(), input);
}

/** FR-29 *Explain*. See `packages/app`'s `explainTickets`. */
export function explainTickets(input: ExplainTicketsInput) {
  return explainTicketsUseCase(writeDeps(), webContext(), input);
}

/** FR-29 *Change Request candidate*. See `packages/app`'s `markChangeRequestCandidates`. */
export function markChangeRequestCandidates(input: ChangeRequestCandidatesInput) {
  return markChangeRequestCandidatesUseCase(writeDeps(), webContext(), input);
}

/** FR-21 manual Mapping of one Ticket. See `packages/app`'s `mapTicket`. */
export function mapTicket(input: MapTicketInput) {
  return mapTicketUseCase(writeDeps(), webContext(), input);
}

// --- FR-1's organisation writes (story 1.3 slice 2). No page calls them yet: the Organisation
// admin surface waits for sign-in and roles (1.4/1.5). Wired now so the bindings, the Clock and the
// id port are pinned by `tests/web-composition.test.ts` before a page can reach them.

/** FR-1: a new Department. See `packages/app`'s `createDepartment`. */
export function createDepartment(input: CreateDepartmentInput) {
  return createDepartmentUseCase(writeDeps(), webContext(), input);
}

/** FR-1: renames a Department. See `packages/app`'s `renameDepartment`. */
export function renameDepartment(input: RenameDepartmentInput) {
  return renameDepartmentUseCase(writeDeps(), webContext(), input);
}

/** FR-1: a new Program in a Department. See `packages/app`'s `createProgram`. */
export function createProgram(input: CreateProgramInput) {
  return createProgramUseCase(writeDeps(), webContext(), input);
}

/** FR-1: renames a Program. See `packages/app`'s `renameProgram`. */
export function renameProgram(input: RenameProgramInput) {
  return renameProgramUseCase(writeDeps(), webContext(), input);
}

/** FR-1: a new Project. See `packages/app`'s `createProject`. */
export function createProject(input: CreateProjectInput) {
  return createProjectUseCase(writeDeps(), webContext(), input);
}

/** FR-1: renames a Project. See `packages/app`'s `renameProject`. */
export function renameProject(input: RenameProjectInput) {
  return renameProjectUseCase(writeDeps(), webContext(), input);
}

/** FR-1: moves a Project between its Department's Programs. See `reassignProjectProgram`. */
export function reassignProjectProgram(input: ReassignProjectProgramInput) {
  return reassignProjectProgramUseCase(writeDeps(), webContext(), input);
}

/** FR-1: moves a Project to another Department. See `reassignProjectDepartment`. */
export function reassignProjectDepartment(input: ReassignProjectDepartmentInput) {
  return reassignProjectDepartmentUseCase(writeDeps(), webContext(), input);
}
