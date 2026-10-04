/**
 * Connector write/read repository (story 5.2 / FR-17).
 *
 * Public reads never return ciphertext or plaintext secrets. Decrypt-for-adapter loads
 * encrypted bytes only for the trusted ingest composition path.
 */
import { and, eq, sql } from 'drizzle-orm';
import type { Bound } from '../../bound';
import { projectNotFound } from '../../project-not-found';
import * as s from '../../schema';

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
  };
}
