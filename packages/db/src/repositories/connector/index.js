/**
 * Connector write/read repository (story 5.2 / FR-17).
 *
 * Public reads never return ciphertext or plaintext secrets. Decrypt-for-adapter loads
 * encrypted bytes only for the trusted ingest composition path.
 */
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { projectNotFound } from '../../project-not-found';
import * as s from '../../schema';
import { lockWatermark } from '../../watermark-lock';
import { trackerRepositoryOn } from '../tracker';
function toPublic(row) {
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
function exactlyOne(what, connectorId, rowCount) {
    if (rowCount !== 1) {
        throw new Error(`connector ${connectorId}: expected to ${what} exactly one row, touched ${rowCount ?? 0}`);
    }
}
export function connectorWriteRepositoryOn(bound) {
    const { tx, tenantId } = bound;
    return {
        async projectAnchor(projectId) {
            const [row] = await tx
                .select({ demoAnchor: s.project.demoAnchor })
                .from(s.project)
                .where(eq(s.project.id, projectId))
                .limit(1);
            if (!row)
                throw projectNotFound(projectId);
            return row.demoAnchor;
        },
        async findConnector(connectorId) {
            const [row] = await tx
                .select()
                .from(s.connector)
                .where(and(eq(s.connector.tenantId, tenantId), eq(s.connector.id, connectorId)))
                .limit(1);
            return row ? toPublic(row) : null;
        },
        async findConnectorForProject(projectId) {
            const [row] = await tx
                .select()
                .from(s.connector)
                .where(and(eq(s.connector.tenantId, tenantId), eq(s.connector.projectId, projectId)))
                .limit(1);
            return row ? toPublic(row) : null;
        },
        async listConnectors() {
            const rows = await tx
                .select()
                .from(s.connector)
                .where(eq(s.connector.tenantId, tenantId));
            return rows.map(toPublic);
        },
        async insertConnector(input) {
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
        async rotateCredentials(connectorId, credentials) {
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
        async updateScope(connectorId, scope) {
            const res = await tx
                .update(s.connector)
                .set({ scope })
                .where(and(eq(s.connector.tenantId, tenantId), eq(s.connector.id, connectorId)));
            exactlyOne('update scope on', connectorId, res.rowCount);
        },
        async appendScopeEvent(input) {
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
            return row.seq;
        },
        async latestScopeSeq(connectorId) {
            const [row] = await tx
                .select({ seq: s.connectorScopeEvent.seq })
                .from(s.connectorScopeEvent)
                .where(and(eq(s.connectorScopeEvent.tenantId, tenantId), eq(s.connectorScopeEvent.connectorId, connectorId)))
                .orderBy(sql `${s.connectorScopeEvent.seq} desc`)
                .limit(1);
            return row?.seq ?? null;
        },
        async appendBasisEvent(input) {
            await lockWatermark(bound, { kind: 'project', projectId: input.projectId });
            const [row] = await tx
                .insert(s.measurementBasisEvent)
                .values({
                tenantId,
                connectorId: input.connectorId,
                projectId: input.projectId,
                basis: input.basis,
                actor: input.actor,
                at: input.at,
            })
                .returning({ seq: s.measurementBasisEvent.seq });
            return row.seq;
        },
        async latestBasis(connectorId) {
            const [row] = await tx
                .select({
                seq: s.measurementBasisEvent.seq,
                basis: s.measurementBasisEvent.basis,
            })
                .from(s.measurementBasisEvent)
                .where(and(eq(s.measurementBasisEvent.tenantId, tenantId), eq(s.measurementBasisEvent.connectorId, connectorId)))
                .orderBy(sql `${s.measurementBasisEvent.seq} desc`)
                .limit(1);
            if (!row)
                return null;
            return { seq: row.seq, basis: row.basis };
        },
        async appendSettingEvent(input) {
            await lockWatermark(bound, { kind: 'project', projectId: input.projectId });
            const [row] = await tx
                .insert(s.connectorSettingEvent)
                .values({
                tenantId,
                connectorId: input.connectorId,
                projectId: input.projectId,
                resolvedStatusIds: [...input.resolvedStatusIds],
                actor: input.actor,
                at: input.at,
            })
                .returning({ seq: s.connectorSettingEvent.seq });
            return row.seq;
        },
        async latestSetting(connectorId) {
            const [row] = await tx
                .select({
                seq: s.connectorSettingEvent.seq,
                resolvedStatusIds: s.connectorSettingEvent.resolvedStatusIds,
            })
                .from(s.connectorSettingEvent)
                .where(and(eq(s.connectorSettingEvent.tenantId, tenantId), eq(s.connectorSettingEvent.connectorId, connectorId)))
                .orderBy(sql `${s.connectorSettingEvent.seq} desc`)
                .limit(1);
            if (!row)
                return null;
            return { seq: row.seq, resolvedStatusIds: row.resolvedStatusIds ?? [] };
        },
        async appendSnapshotAttempt(input) {
            await tx.insert(s.trackerSnapshotAttempt).values({
                tenantId,
                connectorId: input.connectorId,
                reasonCode: input.reasonCode,
                message: input.message,
                attemptedAt: input.attemptedAt,
            });
        },
        async listSnapshotAttempts(connectorId, limit) {
            const rows = await tx
                .select({
                seq: s.trackerSnapshotAttempt.seq,
                connectorId: s.trackerSnapshotAttempt.connectorId,
                reasonCode: s.trackerSnapshotAttempt.reasonCode,
                message: s.trackerSnapshotAttempt.message,
                attemptedAt: s.trackerSnapshotAttempt.attemptedAt,
            })
                .from(s.trackerSnapshotAttempt)
                .where(and(eq(s.trackerSnapshotAttempt.tenantId, tenantId), eq(s.trackerSnapshotAttempt.connectorId, connectorId)))
                .orderBy(desc(s.trackerSnapshotAttempt.seq))
                .limit(limit);
            return rows;
        },
        async latestAttemptAt(connectorId) {
            const [row] = await tx
                .select({ attemptedAt: s.trackerSnapshotAttempt.attemptedAt })
                .from(s.trackerSnapshotAttempt)
                .where(and(eq(s.trackerSnapshotAttempt.tenantId, tenantId), eq(s.trackerSnapshotAttempt.connectorId, connectorId)))
                .orderBy(desc(s.trackerSnapshotAttempt.seq))
                .limit(1);
            return row?.attemptedAt ?? null;
        },
        async latestSnapshot(connectorId) {
            const [row] = await tx
                .select({
                id: s.trackerSnapshot.id,
                connectorId: s.trackerSnapshot.connectorId,
                observedAt: s.trackerSnapshot.observedAt,
                ticketCount: s.trackerSnapshot.ticketCount,
            })
                .from(s.trackerSnapshot)
                .where(and(eq(s.trackerSnapshot.tenantId, tenantId), eq(s.trackerSnapshot.connectorId, connectorId)))
                .orderBy(desc(s.trackerSnapshot.seq))
                .limit(1);
            return row ?? null;
        },
        async latestSnapshotForProject(projectId) {
            const [row] = await tx
                .select({
                id: s.trackerSnapshot.id,
                connectorId: s.trackerSnapshot.connectorId,
                observedAt: s.trackerSnapshot.observedAt,
                ticketCount: s.trackerSnapshot.ticketCount,
            })
                .from(s.trackerSnapshot)
                .innerJoin(s.connector, and(eq(s.connector.tenantId, s.trackerSnapshot.tenantId), eq(s.connector.id, s.trackerSnapshot.connectorId)))
                .where(and(eq(s.trackerSnapshot.tenantId, tenantId), eq(s.connector.projectId, projectId)))
                .orderBy(desc(s.trackerSnapshot.seq))
                .limit(1);
            return row ?? null;
        },
        async setLastError(connectorId, error) {
            const res = await tx
                .update(s.connector)
                .set(error === null
                ? { lastErrorCode: null, lastErrorMessage: null, lastErrorAt: null }
                : {
                    lastErrorCode: error.code,
                    lastErrorMessage: error.message,
                    lastErrorAt: error.at,
                })
                .where(and(eq(s.connector.tenantId, tenantId), eq(s.connector.id, connectorId)));
            exactlyOne('set last error on', connectorId, res.rowCount);
        },
        async countMappingEventsForProject(projectId) {
            const [row] = await tx
                .select({ n: sql `count(*)::int` })
                .from(s.mappingEvent)
                .where(and(eq(s.mappingEvent.tenantId, tenantId), eq(s.mappingEvent.projectId, projectId)));
            return row?.n ?? 0;
        },
        async loadEncryptedCredentials(connectorId) {
            const [row] = await tx
                .select({
                ciphertext: s.connector.credentialsCiphertext,
                nonce: s.connector.credentialsNonce,
                keyId: s.connector.credentialsKeyId,
            })
                .from(s.connector)
                .where(and(eq(s.connector.tenantId, tenantId), eq(s.connector.id, connectorId)))
                .limit(1);
            if (!row?.ciphertext || !row.nonce || !row.keyId)
                return null;
            return { ciphertext: row.ciphertext, nonce: row.nonce, keyId: row.keyId };
        },
        /** Story 5.6: open overlap claims for a Project (conflict banner). */
        async listOpenOverlaps(projectId) {
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
                .where(and(eq(s.connectorOverlap.tenantId, tenantId), eq(s.connectorOverlap.projectId, projectId)))
                .orderBy(s.connectorOverlap.ticketKey);
        },
        /** Story 5.6: durable left-scope Tickets on a Project with retained ledger hours. */
        async listLeftScopeTickets(projectId) {
            const rows = await tx
                .select({
                trackerIssueId: s.ticket.trackerIssueId,
                key: s.ticket.key,
                ownerConnectorId: s.ticket.ownerConnectorId,
            })
                .from(s.ticket)
                .where(and(eq(s.ticket.tenantId, tenantId), eq(s.ticket.projectId, projectId), eq(s.ticket.leftScope, true)))
                .orderBy(s.ticket.key);
            if (rows.length === 0)
                return [];
            const hoursByTicket = new Map();
            const ids = rows.map((r) => r.trackerIssueId);
            const ledgerRows = await tx
                .select({
                ticketId: s.actualsLedgerEntry.ticketId,
                deltaMh: s.actualsLedgerEntry.deltaMh,
            })
                .from(s.actualsLedgerEntry)
                .where(and(eq(s.actualsLedgerEntry.tenantId, tenantId), inArray(s.actualsLedgerEntry.ticketId, ids)));
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
         * moves `owner_connector_id` only on Transfer, clears this claimer's open overlap row.
         */
        async confirmOwnership(input) {
            await lockWatermark(bound, { kind: 'project', projectId: input.projectId });
            const [open] = await tx
                .select()
                .from(s.connectorOverlap)
                .where(and(eq(s.connectorOverlap.tenantId, tenantId), eq(s.connectorOverlap.projectId, input.projectId), eq(s.connectorOverlap.trackerIssueId, input.trackerIssueId), eq(s.connectorOverlap.claimerConnectorId, input.claimerConnectorId)))
                .limit(1);
            if (!open) {
                throw new Error(`overlap ${input.trackerIssueId}/${input.claimerConnectorId} not found on project ${input.projectId}`);
            }
            const [ticketRow] = await tx
                .select()
                .from(s.ticket)
                .where(and(eq(s.ticket.tenantId, tenantId), eq(s.ticket.projectId, input.projectId), eq(s.ticket.trackerIssueId, input.trackerIssueId)))
                .limit(1);
            if (!ticketRow) {
                throw new Error(`ticket ${input.trackerIssueId} not found on project ${input.projectId}`);
            }
            const fromConnectorId = ticketRow.ownerConnectorId;
            const toConnectorId = input.resolution === 'keep' ? fromConnectorId : input.claimerConnectorId;
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
                await tracker.setOwnerConnectorId(ticketRow.trackerKind, ticketRow.trackerSite, ticketRow.trackerIssueId, toConnectorId);
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
                .where(and(eq(s.connectorOverlap.tenantId, tenantId), eq(s.connectorOverlap.projectId, input.projectId), eq(s.connectorOverlap.trackerIssueId, input.trackerIssueId), eq(s.connectorOverlap.claimerConnectorId, input.claimerConnectorId)));
        },
    };
}
