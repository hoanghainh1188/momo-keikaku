import { describe, expect, it } from 'vitest';
import { fixtureReplayOn } from '@momo/adapters';
import { READ_INCOMPLETE_REASON, admitScopeRead, } from '@momo/app';
/**
 * STORY 5.3's PROOF THAT THE COMPLETENESS RULE WORKS (AR-14): the committed `page-shift` fixture
 * replays as an incomplete read, and the gate between a read and any writer lets nothing through
 * but the failed-attempt row. The writer itself is story 5.5; every repository member a writer
 * could reach is recorded here, so a later change that writes on an incomplete read fails this.
 */
const AT = new Date('2026-09-16T09:00:00.000Z');
const ANCHOR = AT.toISOString();
const CTX = {
    tenantId: 'ten-gate',
    userId: 'usr-pm',
    roles: ['pm'],
    projectIds: ['prj-1'],
    locale: 'en',
};
function memoryCursor() {
    const store = new Map();
    return {
        async get(connectorId) {
            return store.get(connectorId) ?? 0;
        },
        async set(connectorId, nextPageIndex) {
            store.set(connectorId, nextPageIndex);
        },
    };
}
/** Deps whose repository records every member called; reads answer, writes only record. */
function recordingDeps() {
    const called = [];
    const audits = [];
    const attempts = [];
    let transactions = 0;
    const reads = {
        findConnector: async (connectorId) => ({
            id: connectorId,
            projectId: 'prj-1',
            adapter: 'fixture',
            site: 'page-shift',
            scope: 'SYN',
            spaceLabel: 'page-shift',
            approvalRecordedAt: AT,
            approvalName: 'Client Approver',
            lastErrorCode: null,
            lastErrorMessage: null,
            lastErrorAt: null,
            hasCredentials: false,
            searchLimit: null,
        }),
        appendSnapshotAttempt: async (input) => {
            attempts.push(input);
        },
    };
    const connectorWrite = new Proxy({}, {
        get(_target, member) {
            return async (...args) => {
                called.push(member);
                const implementation = reads[member];
                return implementation?.(...args);
            };
        },
    });
    const deps = {
        handle: { marker: 'h' },
        clock: { now: () => AT },
        ids: { next: () => 'id' },
        crypto: {
            keyId: 'gate',
            encrypt: () => ({ ciphertext: Buffer.from('c'), nonce: Buffer.from('n-----------'), keyId: 'gate' }),
        },
        transaction: async (_handle, _tenantId, work) => {
            transactions += 1;
            const scope = {
                connectorWrite,
                ingestWrite: { writeIngestSnapshot: async () => ({ kind: 'written', snapshotId: 'x' }) },
                audit: {
                    append: async (entry) => {
                        audits.push(entry);
                    },
                },
            };
            return work(scope);
        },
    };
    return { deps, called, audits, attempts, transactions: () => transactions };
}
describe('page-shift fixture: an incomplete read writes nothing (story 5.3 / AR-14)', () => {
    it('replays page-shift as incomplete and the gate records only the failed attempt', async () => {
        const adapter = fixtureReplayOn({ cursor: memoryCursor() });
        const read = await adapter.readScope({ connectorId: 'con-ps', site: 'page-shift', timeAnchorIso: ANCHOR }, {});
        expect(read.complete).toBe(false);
        const { deps, called, audits, attempts } = recordingDeps();
        const gate = await admitScopeRead(deps, CTX, {
            projectId: 'prj-1',
            connectorId: 'con-ps',
            read,
        });
        expect(gate).toEqual({ ok: true, value: 'incomplete' });
        expect(called).toEqual(['findConnector', 'appendSnapshotAttempt']);
        expect(attempts).toEqual([expect.objectContaining({ reasonCode: READ_INCOMPLETE_REASON })]);
        expect(audits).toEqual([]);
    });
    it('admits the settled page without touching the database', async () => {
        const adapter = fixtureReplayOn({ cursor: memoryCursor() });
        const config = { connectorId: 'con-ps', site: 'page-shift', timeAnchorIso: ANCHOR };
        await adapter.readScope(config, {});
        const settled = await adapter.readScope(config, {});
        expect(settled.complete).toBe(true);
        const { deps, called, transactions } = recordingDeps();
        const gate = await admitScopeRead(deps, CTX, {
            projectId: 'prj-1',
            connectorId: 'con-ps',
            read: settled,
        });
        expect(gate).toEqual({ ok: true, value: 'admitted' });
        expect(called).toEqual([]);
        expect(transactions()).toBe(0);
    });
});
