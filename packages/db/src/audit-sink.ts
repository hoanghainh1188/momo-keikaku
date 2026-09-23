import { encode } from '@momo/domain';
import type { Bound } from './bound';
import * as s from './schema';
import { holdsWatermark, lockWatermark } from './watermark-lock';

/**
 * THE AUDIT SINK — the one writer of `audit_log` for the use cases (story 1.3 slice 1).
 *
 * `packages/app`'s `audit.record` is the one caller; it reaches this through the scope
 * `inTenantTransaction` (`tenant-transaction.ts`) builds, BOUND to that scope's transaction and
 * Tenant.
 * So the record commits with the change or not at all (AD-14): a rollback anywhere in the use
 * case's work takes the audit row with it, and a refused insert here rolls the change back.
 *
 * Satisfies `packages/app`'s `AuditSink` STRUCTURALLY (this package may not import `@momo/app`),
 * checked by the `satisfies` at each composition root. `action` is typed `string` here and is a
 * member of `AUDIT_ACTIONS` by the time it arrives: `audit.record` refuses anything else, and the
 * column deliberately has no constraint of its own.
 *
 * THE PAYLOAD GOES THROUGH THE CODEC (AD-4): `encode(...)`, so a `bigint` is stored as its decimal
 * string instead of throwing inside the driver, and a float is refused naming its path rather
 * than stored lossily.
 *
 * `audit_log` IS APPEND-ONLY AND WATERMARKED (story 1.2 watermark slice, D2). The record rides on
 * the watermark key the transaction already holds — the change it records took one before its own
 * append — and when the transaction holds none (an org or membership write), the sink takes the
 * Tenant key itself, immediately before the insert (`watermark-lock.ts`).
 *
 * `seed.ts`'s `demo.seed` row is not written here: that is seed tooling as `system:seed`, not a
 * use case.
 */
export interface AuditRecord {
  readonly actor: string;
  readonly at: Date;
  readonly action: string;
  readonly target: string;
  readonly payload: unknown;
}

export function auditSinkOn(bound: Bound) {
  const { tx, tenantId } = bound;
  return {
    append: async (entry: AuditRecord): Promise<void> => {
      if (!holdsWatermark(tx)) await lockWatermark(bound, { kind: 'tenant' });
      await tx.insert(s.auditLog).values({
        tenantId,
        actor: entry.actor,
        action: entry.action,
        target: entry.target,
        payload: encode(entry.payload),
        at: entry.at,
      });
    },
  };
}
