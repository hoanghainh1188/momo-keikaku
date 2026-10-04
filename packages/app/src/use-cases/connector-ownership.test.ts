import { describe, expect, it } from 'vitest';
import type { RequestContext } from '../authz/request-context';
import type { ConnectorWriteDeps, ConnectorWriteScope } from '../ports/connector-write';
import { confirmConnectorOwnership } from './connector-ownership';

const AT = new Date('2026-09-01T00:00:00Z');
const CTX: RequestContext = {
  tenantId: 'ten-a',
  userId: 'usr-pm',
  roles: ['pm'],
  projectIds: ['prj-1'],
  locale: 'en',
};

function fakeDeps(openOverlaps: readonly {
  readonly id: string;
  readonly projectId: string;
  readonly trackerIssueId: string;
  readonly ticketKey: string;
  readonly ownerConnectorId: string;
  readonly claimerConnectorId: string;
  readonly observedAt: Date;
}[]) {
  const confirms: unknown[] = [];
  const audits: unknown[] = [];

  const connectorWrite = {
    projectAnchor: async () => AT,
    findConnector: async () => null,
    findConnectorForProject: async () => null,
    listConnectors: async () => [],
    insertConnector: async () => {},
    rotateCredentials: async () => {},
    updateScope: async () => {},
    appendScopeEvent: async () => 1,
    latestScopeSeq: async () => 1,
    appendSnapshotAttempt: async () => {},
    listSnapshotAttempts: async () => [],
    latestAttemptAt: async () => null,
    latestSnapshot: async () => null,
    latestSnapshotForProject: async () => null,
    setLastError: async () => {},
    countMappingEventsForProject: async () => 0,
    loadEncryptedCredentials: async () => null,
    listOpenOverlaps: async () => openOverlaps,
    listLeftScopeTickets: async () => [],
    confirmOwnership: async (input: unknown) => {
      confirms.push(input);
    },
  };

  const deps: ConnectorWriteDeps<{ marker: string }> = {
    handle: { marker: 'h' },
    clock: { now: () => AT },
    ids: { next: () => 'id-1' },
    crypto: {
      keyId: 'local-1',
      encrypt: () => ({
        ciphertext: Buffer.from('x'),
        nonce: Buffer.from('n'),
        keyId: 'local-1',
      }),
    },
    transaction: async (_h, _t, work) => {
      const scope: ConnectorWriteScope = {
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

  return { deps, confirms, audits };
}

describe('confirmConnectorOwnership (story 5.6)', () => {
  const open = [
    {
      id: 'ov-1',
      projectId: 'prj-1',
      trackerIssueId: 'issue-1',
      ticketKey: 'K-1',
      ownerConnectorId: 'con-owner',
      claimerConnectorId: 'con-claimer',
      observedAt: AT,
    },
  ] as const;

  it('Keep affirms the current owner and clears via confirmOwnership', async () => {
    const { deps, confirms, audits } = fakeDeps(open);
    const result = await confirmConnectorOwnership(deps, CTX, {
      projectId: 'prj-1',
      trackerIssueId: 'issue-1',
      resolution: 'keep',
    });
    expect(result).toEqual({ ok: true, value: undefined });
    expect(confirms).toEqual([
      {
        projectId: 'prj-1',
        trackerIssueId: 'issue-1',
        resolution: 'keep',
        toConnectorId: 'con-owner',
        actor: 'user:usr-pm',
        at: AT,
      },
    ]);
    expect(audits[0]).toMatchObject({
      action: 'connector.confirm_ownership',
      target: 'issue-1',
    });
  });

  it('Transfer moves ownership only to the claimer (no auto-transfer without PM confirm)', async () => {
    const { deps, confirms } = fakeDeps(open);
    const result = await confirmConnectorOwnership(deps, CTX, {
      projectId: 'prj-1',
      trackerIssueId: 'issue-1',
      resolution: 'transfer',
    });
    expect(result).toEqual({ ok: true, value: undefined });
    expect(confirms).toEqual([
      {
        projectId: 'prj-1',
        trackerIssueId: 'issue-1',
        resolution: 'transfer',
        toConnectorId: 'con-claimer',
        actor: 'user:usr-pm',
        at: AT,
      },
    ]);
  });

  it('refuses when there is no open overlap for the Ticket', async () => {
    const { deps, confirms } = fakeDeps([]);
    const result = await confirmConnectorOwnership(deps, CTX, {
      projectId: 'prj-1',
      trackerIssueId: 'issue-missing',
      resolution: 'keep',
    });
    expect(result).toMatchObject({ ok: false, error: { code: 'not_found' } });
    expect(confirms).toHaveLength(0);
  });
});
