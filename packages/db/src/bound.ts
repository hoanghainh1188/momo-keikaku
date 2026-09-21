import type { Tx } from './with-tenant';

/**
 * The transaction and the Tenant a write repository is bound to (`tenant-transaction.ts`). Every
 * member of a bound repository issues its statements on `tx` — under `withTenant(tenantId)` — and
 * opens no transaction of its own.
 */
export interface Bound {
  readonly tx: Tx;
  readonly tenantId: string;
}
