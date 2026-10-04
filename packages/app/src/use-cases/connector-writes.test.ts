import { describe, expect, it } from 'vitest';
import type { RequestContext } from '../authz/request-context';
import type { AddConnectorDeps, ConnectorWriteScope } from '../ports/connector-write';
import type { SearchBudgetAssessment } from '../ports/tracker';
import {
  ADD_CONNECTOR_REFUSALS,
  addConnector,
  changeConnectorScope,
  rotateCredentials,
} from './connector-writes';

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

const WITHIN_BUDGET: SearchBudgetAssessment = {
  kind: 'assessed',
  searchLimit: 150,
  ticketCount: 1_900,
  estimatedSearchCalls: 21,
  withinBudget: true,
};

function fakeDeps(overrides?: {
  readonly approvalRecordedAt?: Date | null;
  readonly mappingCount?: number;
  /** When set, successive countMappingEventsForProject calls return these values in order. */
  readonly mappingCountSequence?: readonly number[];
  readonly assessment?: SearchBudgetAssessment;
}) {
  const inserts: unknown[] = [];
  const scopeEvents: unknown[] = [];
  const rotates: unknown[] = [];
  const audits: unknown[] = [];
  const mappingCountCalls: string[] = [];
  const budgetCalls: unknown[] = [];
  let transactions = 0;
  let mappingCount = overrides?.mappingCount ?? 3;
  let mappingSeqIndex = 0;

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
            searchLimit: 150,
          }
        : null,
    findConnectorForProject: async () => null,
    listConnectors: async () => [],
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
    listSnapshotAttempts: async () => [],
    latestAttemptAt: async () => null,
    latestSnapshot: async () => null,
    latestSnapshotForProject: async () => null,
    setLastError: async () => {},
    countMappingEventsForProject: async (projectId: string) => {
      mappingCountCalls.push(projectId);
      if (overrides?.mappingCountSequence) {
        const n = overrides.mappingCountSequence[mappingSeqIndex] ?? mappingCount;
        mappingSeqIndex += 1;
        return n;
      }
      return mappingCount;
    },
    loadEncryptedCredentials: async () => null,
  };

  const deps: AddConnectorDeps<{ marker: string }> = {
    handle: { marker: 'h' },
    clock: { now: () => AT },
    ids: { next: () => 'con-new' },
    crypto: cryptoStub(),
    searchBudget: {
      assessSearchBudget: async (connectorConfig, credentials) => {
        budgetCalls.push({ connectorConfig, credentials });
        return overrides?.assessment ?? WITHIN_BUDGET;
      },
    },
    transaction: async (_h, _t, work) => {
      transactions += 1;
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

  return {
    deps,
    inserts,
    scopeEvents,
    rotates,
    audits,
    mappingCountCalls,
    budgetCalls,
    transactions: () => transactions,
    setMappingCount: (n: number) => {
      mappingCount = n;
    },
  };
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

describe('addConnector Search-budget gate (story 5.3)', () => {
  const INPUT = {
    projectId: 'prj-1',
    spaceUrl: 'https://example.backlog.jp/projects/EC2',
    apiKey: 'secret-key',
    projectKey: 'EC2',
    approvalName: 'Client Approver',
    approvalRecordedAt: '2026-09-01T00:00:00.000Z',
  } as const;

  it('asks Backlog with the parsed site/key and stores the Search limit on insert', async () => {
    const { deps, inserts, budgetCalls } = fakeDeps();
    const result = await addConnector(deps, CTX, INPUT);
    expect(result).toEqual({ ok: true, value: { id: 'con-new' } });
    expect(budgetCalls).toEqual([
      {
        connectorConfig: { site: 'example.backlog.jp', scope: 'EC2' },
        credentials: { apiKey: 'secret-key' },
      },
    ]);
    expect(inserts[0]).toMatchObject({ searchLimit: 150 });
  });

  it('refuses invalid_input search_budget when one full read exceeds 25% of the Search limit', async () => {
    const { deps, inserts, scopeEvents, audits, transactions } = fakeDeps({
      assessment: {
        kind: 'assessed',
        searchLimit: 30,
        ticketCount: 1_900,
        estimatedSearchCalls: 21,
        withinBudget: false,
      },
    });
    const result = await addConnector(deps, CTX, INPUT);
    expect(result).toEqual({
      ok: false,
      error: expect.objectContaining({
        code: 'invalid_input',
        details: { projectKey: [ADD_CONNECTOR_REFUSALS.searchBudget] },
      }),
    });
    expect(inserts).toEqual([]);
    expect(scopeEvents).toEqual([]);
    expect(audits).toEqual([]);
    expect(transactions()).toBe(0);
  });

  it.each([
    ['auth_failed', { apiKey: [ADD_CONNECTOR_REFUSALS.credentialRejected] }],
    ['project_not_found', { projectKey: [ADD_CONNECTOR_REFUSALS.projectNotFound] }],
    ['unreachable', { spaceUrl: [ADD_CONNECTOR_REFUSALS.unreachable] }],
  ] as const)('refuses set-up when Backlog answers %s, writing nothing', async (reason, details) => {
    const { deps, inserts, transactions } = fakeDeps({ assessment: { kind: 'refused', reason } });
    const result = await addConnector(deps, CTX, INPUT);
    expect(result).toEqual({
      ok: false,
      error: expect.objectContaining({ code: 'invalid_input', details }),
    });
    expect(inserts).toEqual([]);
    expect(transactions()).toBe(0);
  });

  it('never calls Backlog for an outsider or a malformed command', async () => {
    const outsider = fakeDeps();
    const foreign: RequestContext = { ...CTX, projectIds: ['prj-other'] };
    expect(await addConnector(outsider.deps, foreign, INPUT)).toEqual({
      ok: false,
      error: expect.objectContaining({ code: 'not_found' }),
    });
    expect(outsider.budgetCalls).toEqual([]);

    const malformed = fakeDeps();
    const result = await addConnector(malformed.deps, CTX, { ...INPUT, spaceUrl: 'not a url' });
    expect(result).toEqual({
      ok: false,
      error: expect.objectContaining({ code: 'invalid_input', details: { spaceUrl: ['custom'] } }),
    });
    expect(malformed.budgetCalls).toEqual([]);
  });
});

describe('rotateCredentials (story 5.2)', () => {
  it('replaces ciphertext and leaves mapping count unchanged', async () => {
    const { deps, rotates, audits, mappingCountCalls } = fakeDeps({ mappingCount: 5 });
    const result = await rotateCredentials(deps, CTX, {
      projectId: 'prj-1',
      connectorId: 'con-1',
      apiKey: 'new-key',
    });
    expect(result).toEqual({ ok: true, value: undefined });
    expect(rotates).toHaveLength(1);
    expect(mappingCountCalls).toEqual(['prj-1', 'prj-1']);
    expect(audits[0]).toMatchObject({ action: 'connector.rotate_credentials' });
    expect(JSON.stringify(audits)).not.toContain('new-key');
  });

  it('throws when mapping_event count changes during rotate', async () => {
    const { deps } = fakeDeps({ mappingCountSequence: [5, 6] });
    await expect(
      rotateCredentials(deps, CTX, {
        projectId: 'prj-1',
        connectorId: 'con-1',
        apiKey: 'new-key',
      }),
    ).rejects.toThrow(/must not change mapping_event/);
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
