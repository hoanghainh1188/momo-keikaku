import type { AuditScope, AuditStamp } from '../audit';
import type { TenantTransaction } from './tenant-transaction';

/**
 * WHAT ANY AUDITED WRITE IS GIVEN (story 1.3 slice 2 — slice 1's project-shaped deps, generalised).
 *
 * A write use case opens exactly one `TenantTransaction` on `handle`, for `ctx.tenantId`, and does
 * its change and its `audit.record` on the scope it is handed. `Scope` is the scope a use case
 * needs — the project write repository for FR-29/FR-21, the organisation repository for FR-1 —
 * and always carries the audit sink. `packages/db`'s `inTenantTransaction` builds ONE scope that
 * carries every repository family, bound to the same transaction; a transaction that hands a
 * wider scope satisfies a port that asks for a narrower one, so each use case still declares only
 * what it touches.
 *
 * There is no actor here (story 1.4 slice 1): the actor is `user:<ctx.userId>`, derived from the
 * `RequestContext` the write is called with (`auditActorOf`), so a composition root states
 * neither the Tenant nor who acted — it only resolves them.
 */
export interface AuditedWriteDeps<Handle, Scope extends AuditScope> {
  readonly handle: Handle;
  readonly transaction: TenantTransaction<Handle, Scope>;
}

/**
 * Who and when, stamped on every row one write lands and on its audit record — the same type as
 * `AuditStamp`, so the change and its record cannot disagree about either. (Slice 1 declared it
 * twice; there is one now.)
 */
export type WriteStamp = AuditStamp;
