import type { AuditSink } from '../audit';
import type { AuditedWriteDeps } from './audited-write';
import type { Clock } from './clock';
import type { IdGenerator } from './ids';

/**
 * THE RESOURCE / RATE WRITE PORT (story 1.6, FR-12) — Resources and dated Rates, plus the
 * Project default Rate's append-only history.
 *
 * DECLARED HERE, SATISFIED STRUCTURALLY, like `OrgRepository`: `packages/db` may not import
 * `@momo/app`, so `packages/db/src/repo-resource.ts` is shaped to match. Bound to one transaction
 * and one Tenant: a `find*` answering `null` is "this Tenant cannot see it".
 *
 * Role rules and the empty-Rate-history rule on create are the use cases'; the repository reads
 * and writes rows.
 */

export interface ResourceDepartmentRow {
  readonly id: string;
}

export interface ResourceRow {
  readonly id: string;
  readonly departmentId: string;
  readonly name: string;
  readonly role: string;
}

export interface NewResourceRow {
  readonly id: string;
  readonly departmentId: string;
  readonly name: string;
  readonly role: string;
}

export interface ResourceProjectRow {
  readonly id: string;
}

export interface RateAppend {
  readonly resourceId: string;
  readonly effectiveFrom: string;
  readonly yenPerHour: number;
}

export interface ProjectDefaultRateAppend {
  readonly projectId: string;
  readonly effectiveFrom: string;
  readonly yenPerHour: number;
}

export interface ResourceWriteRepository {
  /** The Department, or `null` when this Tenant cannot see it. */
  readonly findDepartment: (id: string) => Promise<ResourceDepartmentRow | null>;
  /** The Resource, or `null` when this Tenant cannot see it. */
  readonly findResource: (id: string) => Promise<ResourceRow | null>;
  /** The Project, or `null` when this Tenant cannot see it. LOCKS the row. */
  readonly findProject: (id: string) => Promise<ResourceProjectRow | null>;
  /** Inserts a Resource with empty Tracker Account links and no Rate row. */
  readonly insertResource: (row: NewResourceRow) => Promise<void>;
  /** Appends one `rate_entry` row. Does not touch the Actuals Ledger. */
  readonly appendResourceRate: (row: RateAppend) => Promise<void>;
  /**
   * Appends one `project_default_rate_entry` and updates `project.default_rate_jpy` to that head
   * (dual-write cache). Used by `createProject` (yen 0) and `appendProjectDefaultRate`.
   */
  readonly appendProjectDefaultRate: (row: ProjectDefaultRateAppend) => Promise<void>;
}

/** What one Resource/Rate write transaction hands its work. */
export interface ResourceWriteScope {
  readonly resources: ResourceWriteRepository;
  readonly audit: AuditSink;
}

export type ResourceWriteDeps<Handle> = AuditedWriteDeps<Handle, ResourceWriteScope> & {
  readonly clock: Clock;
  readonly ids: IdGenerator;
};
