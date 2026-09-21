/**
 * `apps/web`'s COMPOSITION ROOT — and the only file under `apps/web` permitted to import
 * `@momo/db`.
 *
 * AD-1 says an inbound adapter may call use cases and nothing else. Something still has to
 * build the database handle, pick the role, and hand `packages/db`'s repository to
 * `packages/app`'s use cases as the port they declare — and that something is this file,
 * named, so the next slice's dependency-cruiser rule can allow exactly this path rather than
 * a pattern. It is a deliberate SECOND carve-out beside `packages/db/auth`, which
 * ARCHITECTURE-SPINE.md calls the only one; recorded in deferred-work.md.
 *
 * WHAT IT WIRES:
 *
 *   * The handle, on the restricted `momo_app` role — not the owner. `FORCE ROW LEVEL
 *     SECURITY` does nothing against a superuser (measured 2026-09-20), so a web app on the
 *     owner's credential would make every policy inert. `@momo/db` cannot read the
 *     configuration itself (the environment fence, and it may not import `@momo/app`), so
 *     the connection string is read here and passed in.
 *   * The port. `packages/db`'s `loadProjectBundle` and `loadReview` are handed over as they
 *     are: `packages/app` declares `ProjectReadPort` and these functions satisfy it
 *     STRUCTURALLY. The `satisfies` below is where TypeScript checks that match — change a
 *     signature on either side and the typecheck names this line.
 *   * The context: `{ tenantId }`, story 1.4's shape with one field. There is no auth yet,
 *     so the single seeded Tenant is stated here, once, instead of at seven call sites.
 *     `resolveRequestContext` replaces `webContext()` when it lands.
 *
 * `webDb()` and `WEB_TENANT_ID` are still exported for ONE caller, `apps/web/src/app/actions.ts`,
 * whose five write actions have not moved onto use cases yet (the next slice, together with
 * the gate). No read call site may use them: the pages call `getProjectHeader` and
 * `getProjectReview` below.
 */
import {
  config,
  getProjectHeader as getProjectHeaderUseCase,
  getProjectReview as getProjectReviewUseCase,
  type ProjectInput,
  type ProjectReadDeps,
  type UseCaseContext,
} from '@momo/app';
import { DEMO_TENANT_ID, getDb, loadProjectBundle, loadReview, type Db } from '@momo/db';

/** The handle, on the restricted application role. Pools are memoised inside `getDb`. */
export function webDb(): Db {
  return getDb(config.APP_DATABASE_URL);
}

/**
 * The Tenant every request in this release belongs to. Read by `webContext()` and, until the
 * writes move, by `actions.ts` — nowhere else.
 */
export const WEB_TENANT_ID = DEMO_TENANT_ID;

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
