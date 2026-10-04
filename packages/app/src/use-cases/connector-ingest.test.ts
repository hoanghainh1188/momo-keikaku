import { describe, expect, it } from 'vitest';
import { ApprovalRequiredError, ingestSnapshot } from '@momo/domain';
import type { RequestContext } from '../authz/request-context';
import type { ConnectorWriteDeps, ConnectorWriteScope } from '../ports/connector-write';
import {
  APPROVAL_REQUIRED_MESSAGE,
  APPROVAL_REQUIRED_REASON,
  CREDENTIAL_AUTH_FAILED_REASON,
  credentialFailureMessage,
  gateIngestApproval,
  notifyCredentialFailure,
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
    }),
    findConnectorForProject: async () => null,
    insertConnector: async () => {},
    rotateCredentials: async () => {},
    updateScope: async () => {},
    appendScopeEvent: async () => 1,
    latestScopeSeq: async () => 1,
    appendSnapshotAttempt: async (input: unknown) => {
      attempts.push(input);
    },
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

  return { deps, attempts, errors, mails };
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
      tickets: [] as const,
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
