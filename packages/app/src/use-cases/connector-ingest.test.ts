import { describe, expect, it } from 'vitest';
import { ApprovalRequiredError, ingestSnapshot, type TicketObservation } from '@momo/domain';
import type { RequestContext } from '../authz/request-context';
import type { ConnectorWriteDeps, ConnectorWriteScope } from '../ports/connector-write';
import {
  READ_COMPLETE_WRITER_PENDING_REASON,
} from './connector-schedule';
import {
  APPROVAL_REQUIRED_MESSAGE,
  APPROVAL_REQUIRED_REASON,
  CREDENTIAL_AUTH_FAILED_REASON,
  READ_INCOMPLETE_MESSAGE,
  READ_INCOMPLETE_REASON,
  admitScopeRead,
  credentialFailureMessage,
  gateIngestApproval,
  notifyCredentialFailure,
  recordIncompleteRead,
  runIngestSnapshotJob,
} from './connector-ingest';

const AT = new Date('2026-09-01T00:00:00Z');
const CTX: RequestContext = {
  tenantId: 'ten-a',
  userId: 'usr-pm',
  roles: ['pm'],
  projectIds: ['prj-1'],
  locale: 'en',
};

function depsWith(approvalRecordedAt: Date | null) {
  const attempts: unknown[] = [];
  const errors: unknown[] = [];
  const mails: unknown[] = [];

  const connectorWrite = {
    projectAnchor: async () => AT,
    findConnector: async () => ({
      id: 'con-1',
      projectId: 'prj-1',
      adapter: 'backlog',
      site: 'example.backlog.jp',
      scope: 'EC2',
      spaceLabel: 'example.backlog.jp',
      approvalRecordedAt,
      approvalName: approvalRecordedAt ? 'A' : null,
      lastErrorCode: null,
      lastErrorMessage: null,
      lastErrorAt: null,
      hasCredentials: true,
      searchLimit: 150,
    }),
    findConnectorForProject: async () => null,
    listConnectors: async () => [],
    insertConnector: async () => {},
    rotateCredentials: async () => {},
    updateScope: async () => {},
    appendScopeEvent: async () => 1,
    latestScopeSeq: async () => 1,
    appendSnapshotAttempt: async (input: unknown) => {
      attempts.push(input);
    },
    listSnapshotAttempts: async () => [],
    latestAttemptAt: async () => null,
    latestSnapshot: async () => null,
    latestSnapshotForProject: async () => null,
    setLastError: async (id: string, error: unknown) => {
      errors.push({ id, error });
    },
    countMappingEventsForProject: async () => 0,
    loadEncryptedCredentials: async () => null,
  };

  const deps: ConnectorWriteDeps<{ marker: string }> & {
    mailer: { send: (m: unknown) => Promise<void> };
  } = {
    handle: { marker: 'h' },
    clock: { now: () => AT },
    ids: { next: () => 'id' },
    crypto: {
      keyId: 'k',
      encrypt: () => ({
        ciphertext: Buffer.from('c'),
        nonce: Buffer.from('n-----------'),
        keyId: 'k',
      }),
    },
    mailer: {
      send: async (m) => {
        mails.push(m);
      },
    },
    transaction: async (_h, _t, work) => {
      const scope: ConnectorWriteScope = {
        connectorWrite,
        audit: { append: async () => {} },
      };
      return work(scope);
    },
  };

  let transactions = 0;
  const countingDeps: typeof deps = {
    ...deps,
    transaction: async (handle, tenantId, work) => {
      transactions += 1;
      return deps.transaction(handle, tenantId, work);
    },
  };

  return { deps: countingDeps, attempts, errors, mails, transactions: () => transactions };
}

describe('gateIngestApproval (story 5.2)', () => {
  it('refuses and records a failed attempt when approval is missing', async () => {
    const { deps, attempts } = depsWith(null);
    const result = await gateIngestApproval(deps, CTX, {
      projectId: 'prj-1',
      connectorId: 'con-1',
    });
    expect(result).toEqual({ ok: true, value: 'refused' });
    expect(attempts).toEqual([
      {
        connectorId: 'con-1',
        reasonCode: APPROVAL_REQUIRED_REASON,
        message: APPROVAL_REQUIRED_MESSAGE,
        attemptedAt: AT,
      },
    ]);
  });

  it('answers approved when approval_recorded_at is set', async () => {
    const { deps, attempts } = depsWith(AT);
    const result = await gateIngestApproval(deps, CTX, {
      projectId: 'prj-1',
      connectorId: 'con-1',
    });
    expect(result).toEqual({ ok: true, value: 'approved' });
    expect(attempts).toEqual([]);
  });

  it('answers not_found for a viewer with empty roles before opening work', async () => {
    const { deps, attempts } = depsWith(AT);
    const viewer: RequestContext = { ...CTX, roles: [], projectIds: [] };
    const result = await gateIngestApproval(deps, viewer, {
      projectId: 'prj-1',
      connectorId: 'con-1',
    });
    expect(result).toEqual({ ok: false, error: expect.objectContaining({ code: 'not_found' }) });
    expect(attempts).toEqual([]);
  });
});

describe('ingestSnapshot domain approval gate', () => {
  it('throws ApprovalRequiredError when approvalRecordedAt is null', () => {
    expect(() =>
      ingestSnapshot({
        prev: null,
        next: {
          observedAt: '2026-09-01T00:00:00.000Z',
          tickets: [],
          hoursFieldPresent: false,
          adapterKind: 'fixture',
        },
        activeBaselineVersionSeq: null,
        seqFrom: 1,
        approvalRecordedAt: null,
      }),
    ).toThrow(ApprovalRequiredError);
  });

  it('throws ApprovalRequiredError when approvalRecordedAt is blank or an invalid Date', () => {
    const next = {
      observedAt: '2026-09-01T00:00:00.000Z',
      tickets: [] as TicketObservation[],
      hoursFieldPresent: false,
      adapterKind: 'fixture' as const,
    };
    expect(() =>
      ingestSnapshot({
        prev: null,
        next,
        activeBaselineVersionSeq: null,
        seqFrom: 1,
        approvalRecordedAt: '   ',
      }),
    ).toThrow(ApprovalRequiredError);
    expect(() =>
      ingestSnapshot({
        prev: null,
        next,
        activeBaselineVersionSeq: null,
        seqFrom: 1,
        approvalRecordedAt: new Date(Number.NaN),
      }),
    ).toThrow(ApprovalRequiredError);
  });

  it('accepts a non-null approvalRecordedAt', () => {
    expect(() =>
      ingestSnapshot({
        prev: null,
        next: {
          observedAt: '2026-09-01T00:00:00.000Z',
          tickets: [],
          hoursFieldPresent: false,
          adapterKind: 'fixture',
        },
        activeBaselineVersionSeq: null,
        seqFrom: 1,
        approvalRecordedAt: '2026-09-01T00:00:00.000Z',
      }),
    ).not.toThrow();
  });
});

describe('recordIncompleteRead / admitScopeRead (story 5.3)', () => {
  it('records exactly one read_incomplete attempt and nothing else', async () => {
    const { deps, attempts, errors, mails } = depsWith(AT);
    const result = await recordIncompleteRead(deps, CTX, {
      projectId: 'prj-1',
      connectorId: 'con-1',
    });
    expect(result).toEqual({ ok: true, value: undefined });
    expect(attempts).toEqual([
      {
        connectorId: 'con-1',
        reasonCode: READ_INCOMPLETE_REASON,
        message: READ_INCOMPLETE_MESSAGE,
        attemptedAt: AT,
      },
    ]);
    expect(errors).toEqual([]);
    expect(mails).toEqual([]);
  });

  it('admits a complete read without opening a transaction', async () => {
    const { deps, attempts, transactions } = depsWith(AT);
    const result = await admitScopeRead(deps, CTX, {
      projectId: 'prj-1',
      connectorId: 'con-1',
      read: { complete: true },
    });
    expect(result).toEqual({ ok: true, value: 'admitted' });
    expect(attempts).toEqual([]);
    expect(transactions()).toBe(0);
  });

  it('answers incomplete and records the failed attempt for an incomplete read', async () => {
    const { deps, attempts } = depsWith(AT);
    const result = await admitScopeRead(deps, CTX, {
      projectId: 'prj-1',
      connectorId: 'con-1',
      read: { complete: false },
    });
    expect(result).toEqual({ ok: true, value: 'incomplete' });
    expect(attempts).toEqual([expect.objectContaining({ reasonCode: READ_INCOMPLETE_REASON })]);
  });

  it('answers not_found for a Connector outside the Project, writing nothing', async () => {
    const { deps, attempts } = depsWith(AT);
    const result = await recordIncompleteRead(deps, { ...CTX, projectIds: ['prj-2'] }, {
      projectId: 'prj-2',
      connectorId: 'con-1',
    });
    expect(result).toEqual({ ok: false, error: expect.objectContaining({ code: 'not_found' }) });
    expect(attempts).toEqual([]);
  });

  it('answers not_found for a viewer before opening work', async () => {
    const { deps, attempts, transactions } = depsWith(AT);
    const viewer: RequestContext = { ...CTX, roles: [], projectIds: [] };
    const result = await admitScopeRead(deps, viewer, {
      projectId: 'prj-1',
      connectorId: 'con-1',
      read: { complete: false },
    });
    expect(result).toEqual({ ok: false, error: expect.objectContaining({ code: 'not_found' }) });
    expect(attempts).toEqual([]);
    expect(transactions()).toBe(0);
  });
});

describe('runIngestSnapshotJob (story 5.4 pre-writer)', () => {
  it('appends read_complete_writer_pending on an admitted complete read and does not write a snapshot', async () => {
    const { deps, attempts } = depsWith(AT);
    const queued: unknown[] = [];
    const result = await runIngestSnapshotJob(
      {
        ...deps,
        queue: {
          enqueue: async (input) => {
            queued.push(input);
          },
        },
        tracker: {
          readScope: async () => ({
            complete: true,
            observedAt: AT.toISOString(),
            tickets: [],
            accounts: [],
            hoursFieldPresent: true,
            rateLimit: null,
            adapterKind: 'backlog',
          }),
        },
        loadCredentials: async () => ({ apiKey: 'k' }),
      },
      CTX,
      { projectId: 'prj-1', connectorId: 'con-1' },
    );
    expect(result).toEqual({ ok: true, value: 'writer_pending' });
    expect(attempts).toEqual([
      expect.objectContaining({ reasonCode: READ_COMPLETE_WRITER_PENDING_REASON }),
    ]);
    expect(queued).toEqual([]);
  });

  it('records read_incomplete when the scope read is incomplete', async () => {
    const { deps, attempts } = depsWith(AT);
    const result = await runIngestSnapshotJob(
      {
        ...deps,
        queue: { enqueue: async () => {} },
        tracker: {
          readScope: async () => ({
            complete: false,
            observedAt: AT.toISOString(),
            tickets: [],
            accounts: [],
            hoursFieldPresent: true,
            rateLimit: null,
            adapterKind: 'backlog',
          }),
        },
        loadCredentials: async () => ({ apiKey: 'k' }),
      },
      CTX,
      { projectId: 'prj-1', connectorId: 'con-1' },
    );
    expect(result).toEqual({ ok: true, value: 'read_incomplete' });
    expect(attempts).toEqual([expect.objectContaining({ reasonCode: READ_INCOMPLETE_REASON })]);
  });

  it('answers not_found for a viewer before touching the tracker', async () => {
    const { deps, attempts } = depsWith(AT);
    let reads = 0;
    const viewer: RequestContext = { ...CTX, roles: [], projectIds: [] };
    const result = await runIngestSnapshotJob(
      {
        ...deps,
        queue: { enqueue: async () => {} },
        tracker: {
          readScope: async () => {
            reads += 1;
            throw new Error('should not read');
          },
        },
        loadCredentials: async () => ({ apiKey: 'k' }),
      },
      viewer,
      { projectId: 'prj-1', connectorId: 'con-1' },
    );
    expect(result).toEqual({ ok: false, error: expect.objectContaining({ code: 'not_found' }) });
    expect(reads).toBe(0);
    expect(attempts).toEqual([]);
  });
});

describe('notifyCredentialFailure (story 5.2)', () => {
  it('records attempt, sets last_error, and mails the PM with freeze copy', async () => {
    const { deps, attempts, errors, mails } = depsWith(AT);
    const result = await notifyCredentialFailure(deps, CTX, {
      projectId: 'prj-1',
      connectorId: 'con-1',
      lastGoodLabel: '19 Sep 18:00',
      to: ['pm@example.com'],
    });
    expect(result).toEqual({ ok: true, value: undefined });
    const message = credentialFailureMessage('19 Sep 18:00');
    expect(attempts[0]).toMatchObject({
      reasonCode: CREDENTIAL_AUTH_FAILED_REASON,
      message,
    });
    expect(errors[0]).toMatchObject({
      error: { code: CREDENTIAL_AUTH_FAILED_REASON, message },
    });
    expect(mails).toEqual([
      {
        to: 'pm@example.com',
        subject: 'momo-keikaku: Backlog Connector credential error',
        text: message,
      },
    ]);
  });

  it('answers not_found for a viewer with empty roles before opening work', async () => {
    const { deps, attempts, mails } = depsWith(AT);
    const viewer: RequestContext = { ...CTX, roles: [], projectIds: [] };
    const result = await notifyCredentialFailure(deps, viewer, {
      projectId: 'prj-1',
      connectorId: 'con-1',
      lastGoodLabel: 'never',
      to: ['pm@example.com'],
    });
    expect(result).toEqual({ ok: false, error: expect.objectContaining({ code: 'not_found' }) });
    expect(attempts).toEqual([]);
    expect(mails).toEqual([]);
  });
});
