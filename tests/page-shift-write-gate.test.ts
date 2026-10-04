import { describe, expect, it } from 'vitest';
import { fixtureReplayOn } from '@momo/adapters';
import {
  READ_INCOMPLETE_REASON,
  admitScopeRead,
  type ConnectorWriteDeps,
  type ConnectorWriteRepository,
  type ConnectorWriteScope,
  type RequestContext,
} from '@momo/app';

/**
 * STORY 5.3's PROOF THAT THE COMPLETENESS RULE WORKS (AR-14): the committed `page-shift` fixture
 * replays as an incomplete read, and the gate between a read and any writer lets nothing through
 * but the failed-attempt row. The writer itself is story 5.5; every repository member a writer
 * could reach is recorded here, so a later change that writes on an incomplete read fails this.
 */

const AT = new Date('2026-09-16T09:00:00.000Z');
const ANCHOR = AT.toISOString();
const CTX: RequestContext = {
  tenantId: 'ten-gate',
  userId: 'usr-pm',
  roles: ['pm'],
  projectIds: ['prj-1'],
  locale: 'en',
};

function memoryCursor() {
  const store = new Map<string, number>();
  return {
    async get(connectorId: string) {
      return store.get(connectorId) ?? 0;
    },
    async set(connectorId: string, nextPageIndex: number) {
      store.set(connectorId, nextPageIndex);
    },
  };
}

/** Deps whose repository records every member called; reads answer, writes only record. */
function recordingDeps() {
  const called: string[] = [];
  const audits: unknown[] = [];
  const attempts: { reasonCode: string }[] = [];
  let transactions = 0;

  const reads: Partial<ConnectorWriteRepository> = {
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
    }),
    appendSnapshotAttempt: async (input) => {
      attempts.push(input);
    },
  };
  const connectorWrite = new Proxy({} as ConnectorWriteRepository, {
    get(_target, member: string) {
      return async (...args: unknown[]) => {
        called.push(member);
        const implementation = reads[member as keyof ConnectorWriteRepository] as
          | ((...a: unknown[]) => Promise<unknown>)
          | undefined;
        return implementation?.(...args);
      };
    },
  });

  const deps: ConnectorWriteDeps<{ marker: string }> = {
    handle: { marker: 'h' },
    clock: { now: () => AT },
    ids: { next: () => 'id' },
    crypto: {
      keyId: 'gate',
      encrypt: () => ({ ciphertext: Buffer.from('c'), nonce: Buffer.from('n-----------'), keyId: 'gate' }),
    },
    transaction: async (_handle, _tenantId, work) => {
      transactions += 1;
      const scope: ConnectorWriteScope = {
        connectorWrite,
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
    const read = await adapter.readScope(
      { connectorId: 'con-ps', site: 'page-shift', timeAnchorIso: ANCHOR },
      {},
    );
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
