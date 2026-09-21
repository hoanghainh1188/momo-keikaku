/**
 * THE TENANT TRANSACTION a use case runs its work in (AD-14, story 1.3 slice 1).
 *
 * A use case that changes anything opens EXACTLY ONE of these, and does all its work — the change
 * and its `audit.record` — on the scope it is handed. `packages/db` satisfies it structurally
 * with `inTenantTransaction` on top of `withTenant`: one `withTenant` call, and every member of
 * the scope bound to that one transaction, for that one Tenant. So:
 *
 *   * the change and its audit record commit together or not at all — a throw anywhere in
 *     `work`, before or after `audit.record`, rolls back both;
 *   * the use case never names a Tenant again once it is inside — the scope's members are bound
 *     to the one it opened with, which is `ctx.tenantId` and nothing else.
 *
 * THIS IS THE ONLY TRANSACTION BOUNDARY a use case opens. The scope's members never open their
 * own (deferred-work: `withTenant` is not re-entrant, and a nested call is a SECOND, independent
 * transaction on another pooled connection, whose rows would survive this one's rollback).
 *
 * The handle is a type parameter, as on the read port: `packages/app` never sees a database type.
 */
export type TenantTransaction<Handle, Scope> = <T>(
  handle: Handle,
  tenantId: string,
  work: (scope: Scope) => Promise<T>,
) => Promise<T>;
