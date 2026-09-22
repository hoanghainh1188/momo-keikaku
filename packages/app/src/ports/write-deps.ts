import type { AuditedWriteDeps } from './audited-write';
import type { Clock } from './clock';
import type { IdGenerator } from './ids';
import type { MembershipWriteScope } from './membership-write';
import type { OrgWriteScope } from './org-write';
import type { ProjectWriteScope } from './project-write';
import type { ResourceWriteScope } from './resource-write';

/**
 * EVERY WRITE USE CASE'S DEPS, IN ONE VALUE — what a composition root builds once and hands to
 * any write on the surface.
 *
 * Its transaction hands the WHOLE scope (`packages/db`'s `inTenantTransaction`: every repository
 * family and the audit sink, bound to one transaction), and it carries the Clock and the id port.
 * It is assignable to each use case's narrower deps (`ProjectWriteDeps`, `OrgWriteDeps`,
 * `MembershipWriteDeps`, `ResourceWriteDeps`), so the
 * web composition root, the write harness and the audit gate each build one of these and drive
 * every write with it. A new repository family joins `WriteScope` here, and the `satisfies` at
 * each composition root then names what is missing.
 */
export type WriteScope = ProjectWriteScope &
  OrgWriteScope &
  MembershipWriteScope &
  ResourceWriteScope;

export type WriteDeps<Handle> = AuditedWriteDeps<Handle, WriteScope> & {
  readonly clock: Clock;
  readonly ids: IdGenerator;
};
