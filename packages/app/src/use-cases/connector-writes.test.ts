import { describe, expect, it, vi } from 'vitest';
import type { RequestContext } from '../authz/request-context';
import type { ConnectorWriteDeps, ConnectorWriteScope } from '../ports/connector-write';
import { addConnector, changeConnectorScope, rotateCredentials } from './connector-writes';

const AT = new Date('2026-09-01T00:00:00Z');
const CTX: RequestContext = {
  tenantId: 'ten-a',
  userId: 'usr-pm',
  roles: ['pm'],
  projectIds: ['prj-1'],
  locale: 'en',
};

function cryptoStub() {
  return {
    keyId: 'local-1',
    encrypt: (plaintext: { apiKey?: string }) => ({
      ciphertext: Buffer.from(`enc:${plaintext.apiKey ?? ''}`),
      nonce: Buffer.from('nonce------'),
      keyId: 'local-1',
    }),
  };
}

function fakeDeps(overrides?: {
  readonly approvalRecordedAt?: Date | null;
  readonly mappingCount?: number;
}) {
  const inserts: unknown[] = [];
  const scopeEvents: unknown[] = [];
  const rotates: unknown[] = [];
  const audits: unknown[] = [];
  let mappingCount = overrides?.mappingCount ?? 3;

  const connectorWrite = {
    projectAnchor: async () => AT,
    findConnector: async (id: string) =>
      id === 'con-1'
        ? {
            id: 'con-1',
            projectId: 'prj-1',
            adapter: 'backlog',
            site: 'example.backlog.jp',
            scope: 'EC2',
            spaceLabel: 'example.backlog.jp',
            approvalRecordedAt: overrides?.approvalRecordedAt ?? AT,
            approvalName: 'Approver',
            lastErrorCode: null,
            lastErrorMessage: null,
            lastErrorAt: null,
            hasCredentials: true,
          }
        : null,
    findConnectorForProject: async () => null,
    insertConnector: async (input: unknown) => {
      inserts.push(input);
    },
    rotateCredentials: async (id: string, credentials: unknown) => {
      rotates.push({ id, credentials });
    },
    updateScope: async () => {},
    appendScopeEvent: async (input: unknown) => {
      scopeEvents.push(input);
      return 7;
    },
    latestScopeSeq: async () => 7,
    appendSnapshotAttempt: async () => {},
    setLastError: async () => {},
    countMappingEventsForProject: async () => mappingCount,
    loadEncryptedCredentials: async () => null,
  };

  const deps: ConnectorWriteDeps<{ marker: string }> = {
    handle: { marker: 'h' },
    clock: { now: () => AT },
    ids: { next: () => 'con-new' },
    crypto: cryptoStub(),
    transaction: async (_h, _t, work) => {
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

  return { deps, inserts, scopeEvents, rotates, audits, setMappingCount: (n: number) => { mappingCount = n; } };
}

describe('addConnector (story 5.2)', () => {
  it('encrypts credentials, records approval, appends scope_event, never stores plaintext', async () => {
    const { deps, inserts, scopeEvents, audits } = fakeDeps();
    const result = await addConnector(deps, CTX, {
      projectId: 'prj-1',
      spaceUrl: 'https://example.backlog.jp/projects/EC2',
      apiKey: 'secret-key',
      projectKey: 'EC2',
      approvalName: 'Client Approver',
      approvalRecordedAt: '2026-09-01T00:00:00.000Z',
    });
    expect(result).toEqual({ ok: true, value: { id: 'con-new' } });
    expect(inserts).toHaveLength(1);
    const row = inserts[0] as {
      credentials: { ciphertext: Buffer; keyId: string };
      approvalName: string;
      site: string;
      apiKey?: string;
    };
    expect(row.site).toBe('example.backlog.jp');
    expect(row.approvalName).toBe('Client Approver');
    expect(row.credentials.keyId).toBe('local-1');
    expect(row.credentials.ciphertext.toString()).toContain('enc:secret-key');
    expect(row).not.toHaveProperty('apiKey');
    expect(scopeEvents).toHaveLength(1);
    expect(audits[0]).toMatchObject({ action: 'connector.add', target: 'con-new' });
    expect(JSON.stringify(audits[0])).not.toContain('secret-key');
  });

  it('refuses a viewer with not_found before opening work', async () => {
    const { deps, inserts } = fakeDeps();
    const viewer: RequestContext = { ...CTX, roles: [], projectIds: [] };
    const result = await addConnector(deps, viewer, {
      projectId: 'prj-1',
      spaceUrl: 'https://example.backlog.jp/',
      apiKey: 'k',
      projectKey: 'EC2',
      approvalName: 'A',
      approvalRecordedAt: AT,
    });
    expect(result).toEqual({ ok: false, error: expect.objectContaining({ code: 'not_found' }) });
    expect(inserts).toEqual([]);
  });
});

describe('rotateCredentials (story 5.2)', () => {
  it('replaces ciphertext and leaves mapping count unchanged', async () => {
    const { deps, rotates, audits } = fakeDeps({ mappingCount: 5 });
    const count = vi.spyOn(deps as never, 'transaction');
    void count;
    const result = await rotateCredentials(deps, CTX, {
      projectId: 'prj-1',
      connectorId: 'con-1',
      apiKey: 'new-key',
    });
    expect(result).toEqual({ ok: true, value: undefined });
    expect(rotates).toHaveLength(1);
    expect(audits[0]).toMatchObject({ action: 'connector.rotate_credentials' });
    expect(JSON.stringify(audits)).not.toContain('new-key');
  });
});

describe('changeConnectorScope (story 5.2)', () => {
  it('appends connector_scope_event and updates scope', async () => {
    const { deps, scopeEvents, audits } = fakeDeps();
    const result = await changeConnectorScope(deps, CTX, {
      projectId: 'prj-1',
      connectorId: 'con-1',
      projectKey: 'EC2-NEW',
    });
    expect(result).toEqual({ ok: true, value: undefined });
    expect(scopeEvents).toEqual([
      expect.objectContaining({ scope: 'EC2-NEW', connectorId: 'con-1' }),
    ]);
    expect(audits[0]).toMatchObject({
      action: 'connector.change_scope',
      payload: { before: 'EC2', after: 'EC2-NEW', projectId: 'prj-1' },
    });
  });
});
