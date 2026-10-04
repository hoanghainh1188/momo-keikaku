/**
 * Tracker identity + fixture-cursor repositories (story 5.1 / AD-6).
 *
 * Upsert helpers for `ticket` and `tracker_account`, and the db-side
 * `FixtureCursorPort`. Seed and tests call these; the full worker ingest writer
 * stays story 5.5.
 */
import { and, eq, sql } from 'drizzle-orm';
import type { TrackerAccountObservation } from '@momo/domain';
import type { Bound } from '../../bound';
import * as s from '../../schema';

export type TrackerKind = 'fixture' | 'backlog';

export interface UpsertTicketInput {
  readonly id: string;
  readonly trackerKind: TrackerKind;
  readonly trackerSite: string;
  readonly trackerIssueId: string;
  readonly ownerConnectorId: string;
  readonly projectId: string;
  readonly key: string;
}

export interface UpsertTrackerAccountInput {
  readonly id: string;
  readonly trackerKind: TrackerKind;
  readonly trackerSite: string;
  readonly observation: TrackerAccountObservation;
}

export function trackerRepositoryOn(bound: Bound) {
  const { tx, tenantId } = bound;

  return {
    /**
     * Upsert Ticket identity on UNIQUE (tenant_id, tracker_kind, tracker_site, tracker_issue_id).
     * On conflict, refresh key / owner / project — identity columns stay put.
     */
    async upsertTicket(input: UpsertTicketInput): Promise<void> {
      await tx
        .insert(s.ticket)
        .values({
          id: input.id,
          tenantId,
          trackerKind: input.trackerKind,
          trackerSite: input.trackerSite,
          trackerIssueId: input.trackerIssueId,
          ownerConnectorId: input.ownerConnectorId,
          projectId: input.projectId,
          key: input.key,
        })
        .onConflictDoUpdate({
          target: [
            s.ticket.tenantId,
            s.ticket.trackerKind,
            s.ticket.trackerSite,
            s.ticket.trackerIssueId,
          ],
          set: {
            key: input.key,
            ownerConnectorId: input.ownerConnectorId,
            projectId: input.projectId,
          },
        });
    },

    /**
     * Upsert Tracker Account identity from a `TrackerAccountObservation` only.
     * Nothing else may create these rows (AD-6 / AR-12).
     */
    async upsertTrackerAccount(input: UpsertTrackerAccountInput): Promise<void> {
      const { observation: obs } = input;
      await tx
        .insert(s.trackerAccount)
        .values({
          id: input.id,
          tenantId,
          trackerKind: input.trackerKind,
          trackerSite: input.trackerSite,
          accountId: obs.accountId,
          displayName: obs.displayName,
          email: obs.email ?? null,
        })
        .onConflictDoUpdate({
          target: [
            s.trackerAccount.tenantId,
            s.trackerAccount.trackerKind,
            s.trackerAccount.trackerSite,
            s.trackerAccount.accountId,
          ],
          set: {
            displayName: obs.displayName,
            email: obs.email ?? null,
          },
        });
    },

    /** FixtureCursorPort.get — next page index, or 0 when unset. */
    async getFixtureCursor(connectorId: string): Promise<number> {
      const [row] = await tx
        .select({ nextPageIndex: s.fixtureCursor.nextPageIndex })
        .from(s.fixtureCursor)
        .where(
          and(eq(s.fixtureCursor.tenantId, tenantId), eq(s.fixtureCursor.connectorId, connectorId)),
        )
        .limit(1);
      return row?.nextPageIndex ?? 0;
    },

    /** FixtureCursorPort.set — persist the next page index. */
    async setFixtureCursor(connectorId: string, nextPageIndex: number): Promise<void> {
      if (!Number.isInteger(nextPageIndex) || nextPageIndex < 0) {
        throw new RangeError(`fixture cursor nextPageIndex must be a non-negative integer, got ${nextPageIndex}`);
      }
      await tx
        .insert(s.fixtureCursor)
        .values({ tenantId, connectorId, nextPageIndex })
        .onConflictDoUpdate({
          target: [s.fixtureCursor.tenantId, s.fixtureCursor.connectorId],
          set: { nextPageIndex },
        });
    },

    /** Test helper: count tickets for a tracker identity triple. */
    async countTicketsByIdentity(
      trackerKind: TrackerKind,
      trackerSite: string,
      trackerIssueId: string,
    ): Promise<number> {
      const [row] = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(s.ticket)
        .where(
          and(
            eq(s.ticket.tenantId, tenantId),
            eq(s.ticket.trackerKind, trackerKind),
            eq(s.ticket.trackerSite, trackerSite),
            eq(s.ticket.trackerIssueId, trackerIssueId),
          ),
        );
      return row?.n ?? 0;
    },
  };
}

/**
 * Bind a `FixtureCursorPort` for one Tenant transaction. Adapters receive this
 * port and never import `@momo/db`.
 */
export function fixtureCursorPortOn(bound: Bound): {
  get(connectorId: string): Promise<number>;
  set(connectorId: string, nextPageIndex: number): Promise<void>;
} {
  const repo = trackerRepositoryOn(bound);
  return {
    get: (connectorId) => repo.getFixtureCursor(connectorId),
    set: (connectorId, nextPageIndex) => repo.setFixtureCursor(connectorId, nextPageIndex),
  };
}
