import { encode } from '@momo/domain';
import type { Db } from './client';
import { identityEvent } from './schema';

/**
 * THE ONE WRITER OF `identity_event` (story 1.4 slice 4): the sink for identity events — a
 * change to a user's credentials or identity links (a completed password reset today; a later
 * link or unlink). A membership change, invitation acceptance included, is a tenant-scoped
 * audited use case and writes `audit_log`, not here (AD-14).
 *
 * `identityEventWriterOn(db)`, in `repo-membership-write.ts`'s shape — but bound to a HANDLE, not
 * a transaction and a Tenant: the table is `global` (no `tenant_id`), so there is no tenant
 * transaction to run inside, and nothing to filter by. It still issues its insert on a `tx`
 * (`db.transaction`), per the bare-handle rule (`source-discipline.test.ts`), exactly as
 * `repo-membership.ts`'s reader does for the same reason.
 *
 * INSERT-ONLY BY GRANT AND TRIGGER: `table-classes.ts` gives the application role
 * `SELECT, INSERT` on this table and nothing else, and `appendOnlyGuard` refuses UPDATE, DELETE
 * and TRUNCATE to everybody until the maintenance hatch is open. This writer decides nothing
 * about correcting or removing a row, because it could not if it tried.
 *
 * `ACTION` IS A CLOSED LIST. Today only `'password.reset'`; a later story adds to it here, in one
 * place, rather than letting the column accept an arbitrary string.
 */
export type IdentityEventAction = 'password.reset';

export interface IdentityEventRecord {
  readonly id: string;
  readonly userId: string;
  readonly action: IdentityEventAction;
  readonly at: Date;
  /** Optional detail, through the one JSON codec (AD-4) like every other stored payload. */
  readonly payload?: unknown;
}

export function identityEventWriterOn(db: Db) {
  return {
    record: async (entry: IdentityEventRecord): Promise<void> => {
      await db.transaction((tx) =>
        tx.insert(identityEvent).values({
          id: entry.id,
          userId: entry.userId,
          action: entry.action,
          at: entry.at,
          payload: entry.payload === undefined ? null : encode(entry.payload),
        }),
      );
    },
  };
}
