/**
 * Connector write/read repository (story 5.2 / FR-17).
 *
 * Public reads never return ciphertext or plaintext secrets. Decrypt-for-adapter loads
 * encrypted bytes only for the trusted ingest composition path.
 */
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import type { Bound } from '../../bound';
import { projectNotFound } from '../../project-not-found';
import * as s from '../../schema';
import { lockWatermark } from '../../watermark-lock';
import { trackerRepositoryOn, type TrackerKind } from '../tracker';

export interface EncryptedCredentialsRow {
  readonly ciphertext: Buffer;
  readonly nonce: Buffer;
  readonly keyId: string;
}

export interface ConnectorPublicRow {
  readonly id: string;
  readonly projectId: string;
  readonly adapter: string;
  readonly site: string;
  readonly scope: string;
  readonly spaceLabel: string;
  readonly approvalRecordedAt: Date | null;
  readonly approvalName: string | null;
  readonly lastErrorCode: string | null;
  readonly lastErrorMessage: string | null;
  readonly lastErrorAt: Date | null;
  readonly hasCredentials: boolean;
  readonly searchLimit: number | null;
}

export interface SnapshotAttemptRow {
  readonly seq: number;
  readonly connectorId: string;
  readonly reasonCode: string;
  readonly message: string;
  readonly attemptedAt: Date;
}

export interface LatestSnapshotRow {
  readonly id: string;
  readonly connectorId: string;
  readonly observedAt: Date;
  readonly ticketCount: number;
}

export interface ConnectorOverlapRow {
  readonly id: string;
  readonly projectId: string;
  readonly trackerIssueId: string;
  readonly ticketKey: string;
  readonly ownerConnectorId: string;
  readonly claimerConnectorId: string;
  readonly observedAt: Date;
}

export interface LeftScopeTicketRow {
  readonly trackerIssueId: string;
  readonly key: string;
  readonly ownerConnectorId: string;
  /** Σ ledger hours retained after leave (not reversed). */
  readonly hoursMh: bigint;
}

function toPublic(row: typeof s.connector.$inferSelect): ConnectorPublicRow {
  return {
    id: row.id,
    projectId: row.projectId,
    adapter: row.adapter,
    site: row.site,
    scope: row.scope,
    spaceLabel: row.spaceLabel,
    approvalRecordedAt: row.approvalRecordedAt,
    approvalName: row.approvalName,
    lastErrorCode: row.lastErrorCode,
    lastErrorMessage: row.lastErrorMessage,
    lastErrorAt: row.lastErrorAt,
    hasCredentials: row.credentialsCiphertext != null && row.credentialsNonce != null,
    searchLimit: row.searchLimit,
  };
}

function exactlyOne(what: string, connectorId: string, rowCount: number | null): void {
  if (rowCount !== 1) {
    throw new Error(
      `connector ${connectorId}: expected to ${what} exactly one row, touched ${rowCount ?? 0}`,
    );
  }
}

export function connectorWriteRepositoryOn(bound: Bound) {
  const { tx, tenantId } = bound;

  return {
    async projectAnchor(projectId: string): Promise<Date> {
      const [row] = await tx
        .select({ demoAnchor: s.project.demoAnchor })
        .from(s.project)
        .where(eq(s.project.id, projectId))
        .limit(1);
      if (!row) throw projectNotFound(projectId);
      return row.demoAnchor;
    },

    async findConnector(connectorId: string): Promise<ConnectorPublicRow | null> {
      const [row] = await tx
        .select()
        .from(s.connector)
        .where(and(eq(s.connector.tenantId, tenantId), eq(s.connector.id, connectorId)))
        .limit(1);
      return row ? toPublic(row) : null;
    },

    async findConnectorForProject(projectId: string): Promise<ConnectorPublicRow | null> {
      const [row] = await tx
        .select()
        .from(s.connector)
        .where(and(eq(s.connector.tenantId, tenantId), eq(s.connector.projectId, projectId)))
        .limit(1);
      return row ? toPublic(row) : null;
    },

    async listConnectors(): Promise<readonly ConnectorPublicRow[]> {
      const rows = await tx
        .select()
        .from(s.connector)
        .where(eq(s.connector.tenantId, tenantId));
      return rows.map(toPublic);
    },

    async insertConnector(input: {
      readonly id: string;
      readonly projectId: string;
      readonly adapter: 'backlog';
      readonly site: string;
      readonly scope: string;
      readonly spaceLabel: string;
      readonly approvalRecordedAt: Date;
      readonly approvalName: string;
      readonly credentials: EncryptedCredentialsRow;
      readonly searchLimit: number | null;
    }): Promise<void> {
      await tx.insert(s.connector).values({
        id: input.id,
        tenantId,
        projectId: input.projectId,
        adapter: input.adapter,
        site: input.site,
        scope: input.scope,
        spaceLabel: input.spaceLabel,
        approvalRecordedAt: input.approvalRecordedAt,
        approvalName: input.approvalName,
        credentialsCiphertext: input.credentials.ciphertext,
        credentialsNonce: input.credentials.nonce,
        credentialsKeyId: input.credentials.keyId,
        searchLimit: input.searchLimit,
      });
    },

    async rotateCredentials(
      connectorId: string,
      credentials: EncryptedCredentialsRow,
    ): Promise<void> {
      const res = await tx
        .update(s.connector)
        .set({
          credentialsCiphertext: credentials.ciphertext,
          credentialsNonce: credentials.nonce,
          credentialsKeyId: credentials.keyId,
          lastErrorCode: null,
          lastErrorMessage: null,
          lastErrorAt: null,
        })
        .where(and(eq(s.connector.tenantId, tenantId), eq(s.connector.id, connectorId)));
      exactlyOne('rotate credentials on', connectorId, res.rowCount);
    },

    async updateScope(connectorId: string, scope: string): Promise<void> {
      const res = await tx
        .update(s.connector)
        .set({ scope })
        .where(and(eq(s.connector.tenantId, tenantId), eq(s.connector.id, connectorId)));
      exactlyOne('update scope on', connectorId, res.rowCount);
    },

    async appendScopeEvent(input: {
      readonly connectorId: string;
      readonly projectId: string;
      readonly scope: string;
      readonly actor: string;
      readonly at: Date;
    }): Promise<number> {
      const [row] = await tx
        .insert(s.connectorScopeEvent)
        .values({
          tenantId,
          connectorId: input.connectorId,
          projectId: input.projectId,
          scope: input.scope,
          actor: input.actor,
          at: input.at,
        })
        .returning({ seq: s.connectorScopeEvent.seq });
      return row!.seq;
    },

    async latestScopeSeq(connectorId: string): Promise<number | null> {
      const [row] = await tx
        .select({ seq: s.connectorScopeEvent.seq })
        .from(s.connectorScopeEvent)
        .where(
          and(
            eq(s.connectorScopeEvent.tenantId, tenantId),
            eq(s.connectorScopeEvent.connectorId, connectorId),
          ),
        )
        .orderBy(sql`${s.connectorScopeEvent.seq} desc`)
        .limit(1);
      return row?.seq ?? null;
    },

    async appendSnapshotAttempt(input: {
      readonly connectorId: string;
      readonly reasonCode: string;
      readonly message: string;
      readonly attemptedAt: Date;
    }): Promise<void> {
      await tx.insert(s.trackerSnapshotAttempt).values({
        tenantId,
        connectorId: input.connectorId,
        reasonCode: input.reasonCode,
        message: input.message,
        attemptedAt: input.attemptedAt,
      });
    },

    async listSnapshotAttempts(
      connectorId: string,
      limit: number,
    ): Promise<readonly SnapshotAttemptRow[]> {
      const rows = await tx
        .select({
          seq: s.trackerSnapshotAttempt.seq,
          connectorId: s.trackerSnapshotAttempt.connectorId,
          reasonCode: s.trackerSnapshotAttempt.reasonCode,
          message: s.trackerSnapshotAttempt.message,
          attemptedAt: s.trackerSnapshotAttempt.attemptedAt,
        })
        .from(s.trackerSnapshotAttempt)
        .where(
          and(
            eq(s.trackerSnapshotAttempt.tenantId, tenantId),
            eq(s.trackerSnapshotAttempt.connectorId, connectorId),
          ),
        )
        .orderBy(desc(s.trackerSnapshotAttempt.seq))
        .limit(limit);
      return rows;
    },

    async latestAttemptAt(connectorId: string): Promise<Date | null> {
      const [row] = await tx
        .select({ attemptedAt: s.trackerSnapshotAttempt.attemptedAt })
        .from(s.trackerSnapshotAttempt)
        .where(
          and(
            eq(s.trackerSnapshotAttempt.tenantId, tenantId),
            eq(s.trackerSnapshotAttempt.connectorId, connectorId),
          ),
        )
        .orderBy(desc(s.trackerSnapshotAttempt.seq))
        .limit(1);
      return row?.attemptedAt ?? null;
    },

    async latestSnapshot(connectorId: string): Promise<LatestSnapshotRow | null> {
      const [row] = await tx
        .select({
          id: s.trackerSnapshot.id,
          connectorId: s.trackerSnapshot.connectorId,
          observedAt: s.trackerSnapshot.observedAt,
          ticketCount: s.trackerSnapshot.ticketCount,
        })
        .from(s.trackerSnapshot)
        .where(
          and(
            eq(s.trackerSnapshot.tenantId, tenantId),
            eq(s.trackerSnapshot.connectorId, connectorId),
          ),
        )
        .orderBy(desc(s.trackerSnapshot.seq))
        .limit(1);
      return row ?? null;
    },

    async latestSnapshotForProject(projectId: string): Promise<LatestSnapshotRow | null> {
      const [row] = await tx
        .select({
          id: s.trackerSnapshot.id,
          connectorId: s.trackerSnapshot.connectorId,
          observedAt: s.trackerSnapshot.observedAt,
          ticketCount: s.trackerSnapshot.ticketCount,
        })
        .from(s.trackerSnapshot)
        .innerJoin(
          s.connector,
          and(
            eq(s.connector.tenantId, s.trackerSnapshot.tenantId),
            eq(s.connector.id, s.trackerSnapshot.connectorId),
          ),
        )
        .where(
          and(
            eq(s.trackerSnapshot.tenantId, tenantId),
            eq(s.connector.projectId, projectId),
          ),
        )
        .orderBy(desc(s.trackerSnapshot.seq))
        .limit(1);
      return row ?? null;
    },

    async setLastError(
      connectorId: string,
      error: { code: string; message: string; at: Date } | null,
    ): Promise<void> {
      const res = await tx
        .update(s.connector)
        .set(
          error === null
            ? { lastErrorCode: null, lastErrorMessage: null, lastErrorAt: null }
            : {
                lastErrorCode: error.code,
                lastErrorMessage: error.message,
                lastErrorAt: error.at,
              },
        )
        .where(and(eq(s.connector.tenantId, tenantId), eq(s.connector.id, connectorId)));
      exactlyOne('set last error on', connectorId, res.rowCount);
    },

    async countMappingEventsForProject(projectId: string): Promise<number> {
      const [row] = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(s.mappingEvent)
        .where(and(eq(s.mappingEvent.tenantId, tenantId), eq(s.mappingEvent.projectId, projectId)));
      return row?.n ?? 0;
    },

    async loadEncryptedCredentials(connectorId: string): Promise<EncryptedCredentialsRow | null> {
      const [row] = await tx
        .select({
          ciphertext: s.connector.credentialsCiphertext,
          nonce: s.connector.credentialsNonce,
          keyId: s.connector.credentialsKeyId,
        })
        .from(s.connector)
        .where(and(eq(s.connector.tenantId, tenantId), eq(s.connector.id, connectorId)))
        .limit(1);
      if (!row?.ciphertext || !row.nonce || !row.keyId) return null;
      return { ciphertext: row.ciphertext, nonce: row.nonce, keyId: row.keyId };
    },

    /** Story 5.6: open overlap claims for a Project (conflict banner). */
    async listOpenOverlaps(projectId: string): Promise<readonly ConnectorOverlapRow[]> {
      return tx
        .select({
          id: s.connectorOverlap.id,
          projectId: s.connectorOverlap.projectId,
          trackerIssueId: s.connectorOverlap.trackerIssueId,
          ticketKey: s.connectorOverlap.ticketKey,
          ownerConnectorId: s.connectorOverlap.ownerConnectorId,
          claimerConnectorId: s.connectorOverlap.claimerConnectorId,
          observedAt: s.connectorOverlap.observedAt,
        })
        .from(s.connectorOverlap)
        .where(
          and(eq(s.connectorOverlap.tenantId, tenantId), eq(s.connectorOverlap.projectId, projectId)),
        )
        .orderBy(s.connectorOverlap.ticketKey);
    },

    /** Story 5.6: durable left-scope Tickets on a Project with retained ledger hours. */
    async listLeftScopeTickets(projectId: string): Promise<readonly LeftScopeTicketRow[]> {
      const rows = await tx
        .select({
          trackerIssueId: s.ticket.trackerIssueId,
          key: s.ticket.key,
          ownerConnectorId: s.ticket.ownerConnectorId,
        })
        .from(s.ticket)
        .where(
          and(
            eq(s.ticket.tenantId, tenantId),
            eq(s.ticket.projectId, projectId),
            eq(s.ticket.leftScope, true),
          ),
        )
        .orderBy(s.ticket.key);
      if (rows.length === 0) return [];

      const hoursByTicket = new Map<string, bigint>();
      const ids = rows.map((r) => r.trackerIssueId);
      const ledgerRows = await tx
        .select({
          ticketId: s.actualsLedgerEntry.ticketId,
          deltaMh: s.actualsLedgerEntry.deltaMh,
        })
        .from(s.actualsLedgerEntry)
        .where(
          and(
            eq(s.actualsLedgerEntry.tenantId, tenantId),
            inArray(s.actualsLedgerEntry.ticketId, ids),
          ),
        );
      for (const e of ledgerRows) {
        hoursByTicket.set(e.ticketId, (hoursByTicket.get(e.ticketId) ?? 0n) + e.deltaMh);
      }
      return rows.map((r) => ({
        trackerIssueId: r.trackerIssueId,
        key: r.key,
        ownerConnectorId: r.ownerConnectorId,
        hoursMh: hoursByTicket.get(r.trackerIssueId) ?? 0n,
      }));
    },

    /**
     * Story 5.6: PM Keep / Transfer under the Project lock. Appends `connector_ownership_event`,
     * moves `owner_connector_id` only on Transfer, clears open overlaps for the Ticket.
     */
    async confirmOwnership(input: {
      readonly projectId: string;
      readonly trackerIssueId: string;
      readonly resolution: 'keep' | 'transfer';
      readonly toConnectorId: string;
      readonly actor: string;
      readonly at: Date;
    }): Promise<void> {
      await lockWatermark(bound, { kind: 'project', projectId: input.projectId });

      const [ticketRow] = await tx
        .select()
        .from(s.ticket)
        .where(
          and(
            eq(s.ticket.tenantId, tenantId),
            eq(s.ticket.projectId, input.projectId),
            eq(s.ticket.trackerIssueId, input.trackerIssueId),
          ),
        )
        .limit(1);
      if (!ticketRow) {
        throw new Error(`ticket ${input.trackerIssueId} not found on project ${input.projectId}`);
      }

      const fromConnectorId = ticketRow.ownerConnectorId;
      const toConnectorId =
        input.resolution === 'keep' ? fromConnectorId : input.toConnectorId;

      if (input.resolution === 'transfer') {
        const [dest] = await tx
          .select({ id: s.connector.id, projectId: s.connector.projectId })
          .from(s.connector)
          .where(and(eq(s.connector.tenantId, tenantId), eq(s.connector.id, toConnectorId)))
          .limit(1);
        if (!dest || dest.projectId !== input.projectId) {
          throw new Error(`connector ${toConnectorId} not found for project ${input.projectId}`);
        }
        const tracker = trackerRepositoryOn(bound);
        await tracker.setOwnerConnectorId(
          ticketRow.trackerKind as TrackerKind,
          ticketRow.trackerSite,
          ticketRow.trackerIssueId,
          toConnectorId,
        );
      }

      await tx.insert(s.connectorOwnershipEvent).values({
        tenantId,
        projectId: input.projectId,
        trackerIssueId: input.trackerIssueId,
        fromConnectorId,
        toConnectorId,
        resolution: input.resolution,
        actor: input.actor,
        at: input.at,
      });

      await tx
        .delete(s.connectorOverlap)
        .where(
          and(
            eq(s.connectorOverlap.tenantId, tenantId),
            eq(s.connectorOverlap.projectId, input.projectId),
            eq(s.connectorOverlap.trackerIssueId, input.trackerIssueId),
          ),
        );
    },
  };
}
