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

function fakeDeps(options?: {
  readonly confirmError?: Error;
  readonly roles?: RequestContext['roles'];
}) {
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
    listOpenOverlaps: async () => [],
    listLeftScopeTickets: async () => [],
    confirmOwnership: async (input: unknown) => {
      if (options?.confirmError) throw options.confirmError;
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

  const ctx: RequestContext = {
    ...CTX,
    roles: options?.roles ?? CTX.roles,
  };

  return { deps, confirms, audits, ctx };
}

describe('confirmConnectorOwnership (story 5.6)', () => {
  it('Keep affirms the current owner via confirmOwnership under lock', async () => {
    const { deps, confirms, audits, ctx } = fakeDeps();
    const result = await confirmConnectorOwnership(deps, ctx, {
      projectId: 'prj-1',
      trackerIssueId: 'issue-1',
      claimerConnectorId: 'con-claimer',
      resolution: 'keep',
    });
    expect(result).toEqual({ ok: true, value: undefined });
    expect(confirms).toEqual([
      {
        projectId: 'prj-1',
        trackerIssueId: 'issue-1',
        claimerConnectorId: 'con-claimer',
        resolution: 'keep',
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
    const { deps, confirms, ctx } = fakeDeps();
    const result = await confirmConnectorOwnership(deps, ctx, {
      projectId: 'prj-1',
      trackerIssueId: 'issue-1',
      claimerConnectorId: 'con-claimer',
      resolution: 'transfer',
    });
    expect(result).toEqual({ ok: true, value: undefined });
    expect(confirms).toEqual([
      {
        projectId: 'prj-1',
        trackerIssueId: 'issue-1',
        claimerConnectorId: 'con-claimer',
        resolution: 'transfer',
        actor: 'user:usr-pm',
        at: AT,
      },
    ]);
  });

  it('refuses when the open overlap is gone under the lock', async () => {
    const { deps, confirms, ctx } = fakeDeps({
      confirmError: new Error('overlap issue-1/con-claimer not found on project prj-1'),
    });
    const result = await confirmConnectorOwnership(deps, ctx, {
      projectId: 'prj-1',
      trackerIssueId: 'issue-1',
      claimerConnectorId: 'con-claimer',
      resolution: 'keep',
    });
    expect(result).toMatchObject({ ok: false, error: { code: 'not_found' } });
    expect(confirms).toHaveLength(0);
  });

  it('refuses a caller without project reach', async () => {
    const { deps, confirms, ctx } = fakeDeps({ roles: [] });
    const result = await confirmConnectorOwnership(deps, ctx, {
      projectId: 'prj-1',
      trackerIssueId: 'issue-1',
      claimerConnectorId: 'con-claimer',
      resolution: 'transfer',
    });
    expect(result).toMatchObject({ ok: false, error: { code: 'not_found' } });
    expect(confirms).toHaveLength(0);
  });
});
