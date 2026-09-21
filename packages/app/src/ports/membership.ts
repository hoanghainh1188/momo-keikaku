/**
 * THE MEMBERSHIP PORT (story 1.4 slice 1): the tenant-membership bridge, read to resolve a request.
 *
 * `packages/db`'s `membershipsOf(handle, userId)` satisfies it structurally, and it is the one
 * reader of `tenant_membership` for request resolution (`packages/db/src/source-discipline.test.ts`).
 * `resolveRequestContext` is its one caller. Writes go the other way, through the bridge's one
 * writer (`ports/membership-write.ts`, story 1.4 slice 2's audited use cases), never through here.
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
