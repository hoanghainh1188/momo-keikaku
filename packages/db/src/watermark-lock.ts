import { createHash } from 'node:crypto';
import { sql } from 'drizzle-orm';
import type { Bound } from './bound';
import type { Tx } from './with-tenant';

/**
 * THE WATERMARK LOCK — the one place `pg_advisory_xact_lock` is taken (story 1.2 watermark slice;
 * AD-20, AR-37).
 *
 * WHY. An append-only table is read at a watermark: "the latest row at or below `seq`". A reader
 * can only trust that pin when no transaction still holds an uncommitted `seq` below it. So every
 * writer takes the EXCLUSIVE lock on its scope before it obtains a `seq` (the identity default is
 * evaluated by the INSERT, after the lock), and a reader pins `seq_max` under the SHARED lock:
 * once the shared lock is granted, every writer that obtained a lower `seq` has committed or
 * rolled back. Within one scope, `seq` order is therefore commit order.
 *
 * THE KEY. The two-argument form, `pg_advisory_xact_lock(namespace int4, key int4)`:
 *
 *   * namespace 1 = Project, 2 = Tenant (`WATERMARK_NAMESPACE`);
 *   * key = the first 4 bytes of SHA-256 over `tenantId + '\0' + scopeId`, read big-endian as a
 *     signed int32. `scopeId` is the Project's id for a Project scope and the Tenant's own id for
 *     a Tenant scope. The Tenant is in the hash so two Tenants' Projects with equal ids do not
 *     share a key. A collision between two scopes only over-serialises them; it never breaks
 *     correctness, because the lock is advisory and each scope's rows stay its own.
 *
 * Both arguments are BOUND parameters, never interpolated. The two-argument key space is disjoint
 * from the one-argument bigint key `seed-suite-lock.ts` uses (`8_700_000_018/19`), so the two never
 * interfere. The single-argument `hashtext` form is not used (the spine withdrew it).
 *
 * TRANSACTION-SCOPED. `_xact_` releases the lock at COMMIT or ROLLBACK; there is no unlock, and
 * a rolled-back append releases it like a committed one. It is issued on the scope's `tx` — this
 * helper opens no transaction.
 *
 * ORDER. When one transaction needs both, it takes the Project key before the Tenant key. Nothing
 * takes a Tenant key and then a Project key: a request for a Project key in a transaction that
 * already holds a Tenant key throws instead of risking a deadlock against the documented order.
 *
 * WHEN. Long work happens before the lock; the lock is the last thing before the first append.
 *
 * WHAT IT REMEMBERS. The keys each transaction holds, in a WeakMap keyed by the `tx` object every
 * member of a write scope shares (`tenant-transaction.ts`). A second call for a key already held
 * issues nothing. The audit sink reads `holdsWatermark` to ride on whatever key the transaction
 * already holds, and takes the Tenant key only when it holds none (founder decision D2).
 *
 * WHO CALLS IT (D2). Project key: `mapping_event`, `disposition_event`,
 * `project_default_rate_entry`. Tenant key: `rate_entry`. `audit_log` rides on the held key.
 * `identity_event` is global — it has no Tenant or Project to key on — and takes none. The Epic 2/5
 * writers (2.9, 2.10, 5.5) call this when they land; the future `ComputationInputs` capture takes
 * `lockWatermarkShared`.
 */

/** The advisory-lock namespaces — the first argument of the two-argument form. */
export const WATERMARK_NAMESPACE = { project: 1, tenant: 2 } as const;

/** Which watermark a transaction appends under. A Tenant scope is the bound Tenant's own. */
export type WatermarkScope =
  | { readonly kind: 'project'; readonly projectId: string }
  | { readonly kind: 'tenant' };

type LockMode = 'shared' | 'exclusive';

/** The keys each open transaction holds, by `scopeLabel`. Dropped with the `tx` object. */
const held = new WeakMap<Tx, Map<string, LockMode>>();

/**
 * The int4 key for one scope: the first 4 bytes of SHA-256 over `tenantId + '\0' + scopeId`, as a
 * signed big-endian int32. Exported for the tests that pin its stability.
 */
export function watermarkKey(tenantId: string, scopeId: string): number {
  return createHash('sha256').update(`${tenantId}\0${scopeId}`, 'utf8').digest().readInt32BE(0);
}

function scopeIdOf(tenantId: string, scope: WatermarkScope): string {
  return scope.kind === 'project' ? scope.projectId : tenantId;
}

function scopeLabel(scope: WatermarkScope): string {
  return scope.kind === 'project' ? `project:${scope.projectId}` : 'tenant';
}

function holdsTenantKey(keys: ReadonlyMap<string, LockMode>): boolean {
  return keys.has('tenant');
}

async function acquire(bound: Bound, scope: WatermarkScope, mode: LockMode): Promise<void> {
  const { tx, tenantId } = bound;
  const keys = held.get(tx) ?? new Map<string, LockMode>();
  const label = scopeLabel(scope);
  const current = keys.get(label);
  // Exclusive covers shared; the same mode again is a no-op.
  if (current === 'exclusive' || current === mode) return;
  if (scope.kind === 'project' && holdsTenantKey(keys)) {
    throw new Error(
      `watermark lock order: ${label} requested after the Tenant key. A transaction that needs ` +
        'both takes the Project key first.',
    );
  }
  const namespace = WATERMARK_NAMESPACE[scope.kind];
  const key = watermarkKey(tenantId, scopeIdOf(tenantId, scope));
  if (mode === 'exclusive') {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${namespace}::int4, ${key}::int4)`);
  } else {
    await tx.execute(sql`SELECT pg_advisory_xact_lock_shared(${namespace}::int4, ${key}::int4)`);
  }
  held.set(tx, new Map([...keys, [label, mode]]));
}

/**
 * The EXCLUSIVE watermark lock, taken by an append before the INSERT that obtains its `seq`.
 * Waits for every other holder of the same key, shared or exclusive.
 */
export function lockWatermark(bound: Bound, scope: WatermarkScope): Promise<void> {
  return acquire(bound, scope, 'exclusive');
}

/**
 * The SHARED watermark lock, for a reader pinning `seq_max` (the future `ComputationInputs`
 * capture). Shared holders run together; an append waits until every one of them has committed.
 */
export function lockWatermarkShared(bound: Bound, scope: WatermarkScope): Promise<void> {
  return acquire(bound, scope, 'shared');
}

/** Whether this transaction already holds an EXCLUSIVE watermark key — any scope. */
export function holdsWatermark(tx: Tx): boolean {
  const keys = held.get(tx);
  return keys !== undefined && [...keys.values()].includes('exclusive');
}
