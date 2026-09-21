/**
 * THE MEMBERSHIP PORT (story 1.4 slice 1): the tenant-membership bridge, read.
 *
 * `packages/db`'s `membershipsOf(handle, userId)` satisfies it structurally, and it is the ONE
 * reader of `tenant_membership` in the codebase (`packages/db/src/source-discipline.test.ts`).
 * `resolveRequestContext` is its one caller. Nothing here writes a membership: that is slice 2's
 * audited use case.
 */
export interface MembershipRecord {
  readonly tenantId: string;
  /** As stored; the resolver accepts only the roles `authz/request-context.ts` names. */
  readonly role: string;
  readonly projectIds: readonly string[];
}

export interface MembershipReader<Handle> {
  /** Every membership of `userId`, in a stable order (by Tenant id). */
  readonly membershipsOf: (handle: Handle, userId: string) => Promise<readonly MembershipRecord[]>;
}
