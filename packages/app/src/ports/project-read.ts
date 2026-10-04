/**
 * The port the project read use cases depend on.
 *
 * DECLARED HERE, SATISFIED STRUCTURALLY. `packages/db` declares `@momo/domain`, `drizzle-orm`
 * and `pg`, and deliberately not `@momo/app`: importing it would invert the architecture's
 * import direction. So `packages/db` cannot `implements` this interface — and does not need
 * to. Its existing `loadProjectBundle(db, tenantId, projectId)` and `loadReview(...)` already
 * have this shape, and TypeScript checks the match at the composition root, the one place
 * that names both sides (`apps/web/src/server/composition.ts`, and the harness's own in
 * `tests/cross-tenant.test.ts`). No new import edge exists in either direction.
 *
 * THE HANDLE IS A TYPE PARAMETER, so the port can describe `packages/db`'s functions as
 * they are — a handle first, then the Tenant, then the Project — without naming Drizzle.
 * The composition root chooses the handle; nothing in `packages/app` ever looks inside it.
 *
 * The members are function-typed PROPERTIES rather than methods on purpose: TypeScript checks
 * method parameters bivariantly and property parameters strictly, and the point of the
 * structural match is that a drifted signature fails the typecheck at the composition root.
 */
import type {
  BaselineVersion,
  MappingRule,
  ProjectConfig,
  Resource,
  ReviewInput,
  ReviewResult,
  WorkPackage,
} from '@momo/domain';

/**
 * Everything the project pages render, in one value.
 *
 * The same shape `packages/db/src/repo.ts` returns, restated here because `packages/app`
 * cannot import it. The two are kept in step by the typecheck, in both directions: the
 * composition root fails if the repository returns less than this, and the pages fail if
 * this promises less than they read.
 */
export interface ProjectBundle {
  project: ProjectConfig;
  meta: {
    tenantName: string;
    departmentName: string;
    clientName: string;
    connector: {
      id: string;
      adapter: string;
      scope: string;
      spaceLabel: string;
      site: string;
      approvalRecordedAt: string | null;
      approvalName: string | null;
      lastErrorCode: string | null;
      lastErrorMessage: string | null;
      lastErrorAt: string | null;
      hasCredentials: boolean;
    };
    /** AD-15 / review G-5: the demo's fixed clock. */
    anchor: string;
    snapshotAgeMinutes: number;
    baselineReason: string;
    baselineRecordedAt: string;
  };
  input: ReviewInput;
  rules: (MappingRule & { currentlyMapped: number })[];
  wps: WorkPackage[];
  /** The active Baseline — null while the Project has none (story 2.1, decision 2-A). */
  baseline: BaselineVersion | null;
  resources: Resource[];
}

/** The bundle, and the Reconciliation Review computed over it. */
export interface ProjectReview {
  bundle: ProjectBundle;
  review: ReviewResult;
}

export interface ProjectReadPort<Handle> {
  readonly loadProjectBundle: (
    handle: Handle,
    tenantId: string,
    projectId: string,
  ) => Promise<ProjectBundle>;
  readonly loadReview: (
    handle: Handle,
    tenantId: string,
    projectId: string,
  ) => Promise<ProjectReview>;
}

/** What a project read use case is given: the port, and the handle it is called with. */
export interface ProjectReadDeps<Handle> {
  readonly handle: Handle;
  readonly projectRead: ProjectReadPort<Handle>;
}

/**
 * How an adapter reports a Project the Tenant cannot see: it REJECTS, with an `Error` whose
 * message begins `project <projectId> not found`.
 *
 * That is `packages/db`'s existing behaviour (`repo.ts`, the first statement of the bundle
 * read), and this slice may not change `packages/db`'s public behaviour, so the contract is
 * written down here rather than re-engineered there. Row-level security makes "does not
 * exist" and "belongs to another Tenant" the same event — the row is simply invisible — so
 * this one recognition covers both, which is exactly the `not_found` rule.
 *
 * Matched on the caller's OWN projectId, so an unrelated failure that happens to say
 * "not found" is not mistaken for it. Anything else the adapter throws is not recognised and
 * propagates: a connection failure is not a missing Project, and answering `not_found` for it
 * would turn an outage into a page that says the Project does not exist.
 *
 * If the adapter's wording ever changes, the cross-tenant harness fails naming the use case,
 * because a foreign Project id then throws instead of answering `not_found`.
 */
export function isProjectNotFound(error: unknown, projectId: string): boolean {
  return error instanceof Error && error.message.startsWith(`project ${projectId} not found`);
}
