/**
 * `apps/web`'s COMPOSITION ROOT — and the only file under `apps/web` permitted to import
 * `@momo/db`. `.dependency-cruiser.cjs` (rule `apps-not-to-db`) names this exact path, and
 * `pnpm depcruise` fails CI on any other `apps/*` file importing `packages/db` or Drizzle.
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
 *     the project write repository and the audit sink, both bound to one transaction), and
 *     these functions satisfy them STRUCTURALLY. The two `satisfies` below are where
 *     TypeScript checks that match — change a signature on either side and the typecheck names
 *     the line.
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
  explainTickets as explainTicketsUseCase,
  getClientView as getClientViewUseCase,
  getProjectHeader as getProjectHeaderUseCase,
  getProjectMapping as getProjectMappingUseCase,
  getProjectReview as getProjectReviewUseCase,
  mapTicket as mapTicketUseCase,
  mapTickets as mapTicketsUseCase,
  markChangeRequestCandidates as markChangeRequestCandidatesUseCase,
  planTicketsAsWorkPackage as planTicketsAsWorkPackageUseCase,
  type ChangeRequestCandidatesInput,
  type ExplainTicketsInput,
  type MapTicketInput,
  type MapTicketsInput,
  type PlanTicketsInput,
  type ProjectInput,
  type ProjectReadDeps,
  type ProjectWriteDeps,
  type UseCaseContext,
} from '@momo/app';
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
 * The project write deps, wired: the one tenant transaction every write use case runs its change
 * and its audit record in (AD-14). Built per call, for the same reason as the read port.
 */
function projectWriteDeps() {
  return {
    handle: webDb(),
    actor: WEB_ACTOR,
    transaction: inTenantTransaction,
  } satisfies ProjectWriteDeps<Db>;
}

/** FR-29 *Map*. See `packages/app`'s `mapTickets`. */
export function mapTickets(input: MapTicketsInput) {
  return mapTicketsUseCase(projectWriteDeps(), webContext(), input);
}

/** FR-29 *Plan*. See `packages/app`'s `planTicketsAsWorkPackage`. */
export function planTicketsAsWorkPackage(input: PlanTicketsInput) {
  return planTicketsAsWorkPackageUseCase(projectWriteDeps(), webContext(), input);
}

/** FR-29 *Explain*. See `packages/app`'s `explainTickets`. */
export function explainTickets(input: ExplainTicketsInput) {
  return explainTicketsUseCase(projectWriteDeps(), webContext(), input);
}

/** FR-29 *Change Request candidate*. See `packages/app`'s `markChangeRequestCandidates`. */
export function markChangeRequestCandidates(input: ChangeRequestCandidatesInput) {
  return markChangeRequestCandidatesUseCase(projectWriteDeps(), webContext(), input);
}

/** FR-21 manual Mapping of one Ticket. See `packages/app`'s `mapTicket`. */
export function mapTicket(input: MapTicketInput) {
  return mapTicketUseCase(projectWriteDeps(), webContext(), input);
}
