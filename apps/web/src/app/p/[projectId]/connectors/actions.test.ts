/**
 * Connector server actions (story 5.2 / FR-17).
 * Prove refuse skips revalidate; land revalidates; field wiring; datetime-local as UTC.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const revalidatePath = vi.hoisted(() => vi.fn());
const requestContext = vi.hoisted(() =>
  vi.fn(async () => ({ userId: 'u1', roles: ['pm'], projectIds: ['p1'], locale: 'en' })),
);
const addConnector = vi.hoisted(() => vi.fn());
const rotateCredentials = vi.hoisted(() => vi.fn());

vi.mock('next/cache', () => ({ revalidatePath }));
vi.mock('@/server/composition', () => ({
  requestContext,
  addConnector,
  rotateCredentials,
}));
vi.mock('@/server/error-message', () => ({
  messageFromKey: (key: string) => `msg:${key}`,
}));

const { addConnectorAction, rotateCredentialsAction, INITIAL_CONNECTOR_ACTION } =
  await import('./actions');
const { parseApprovalWhen } = await import('./parse-approval-when');

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [name, value] of Object.entries(fields)) data.set(name, value);
  return data;
}

beforeEach(() => {
  revalidatePath.mockReset();
  addConnector.mockReset();
  rotateCredentials.mockReset();
  requestContext.mockClear();
});

describe('parseApprovalWhen', () => {
  it('treats bare datetime-local as UTC by appending Z', () => {
    expect(parseApprovalWhen('2026-09-01T12:30')).toBe('2026-09-01T12:30:00.000Z');
  });

  it('keeps an explicit offset', () => {
    expect(parseApprovalWhen('2026-09-01T12:30:00+09:00')).toBe('2026-09-01T03:30:00.000Z');
  });

  it('returns null for empty or invalid', () => {
    expect(parseApprovalWhen('')).toBeNull();
    expect(parseApprovalWhen('not-a-date')).toBeNull();
  });
});

describe('addConnectorAction', () => {
  it('refuses invalid approval when without calling the use case', async () => {
    const outcome = await addConnectorAction(
      INITIAL_CONNECTOR_ACTION,
      form({
        projectId: 'p1',
        spaceUrl: 'https://example.backlog.jp/',
        apiKey: 'k',
        projectKey: 'EC2',
        approvalName: 'A',
        approvalRecordedAt: 'bogus',
      }),
    );
    expect(outcome).toEqual({ error: 'msg:errors.invalid_input', resetKey: 0 });
    expect(addConnector).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('returns refuse and skips revalidate when the use case refuses', async () => {
    addConnector.mockResolvedValueOnce({
      ok: false,
      error: { code: 'invalid_input', messageKey: 'errors.invalid_input' },
    });
    const outcome = await addConnectorAction(
      INITIAL_CONNECTOR_ACTION,
      form({
        projectId: 'p1',
        spaceUrl: 'https://example.backlog.jp/',
        apiKey: 'k',
        projectKey: 'EC2',
        approvalName: 'A',
        approvalRecordedAt: '2026-09-01T00:00',
      }),
    );
    expect(outcome).toEqual({ error: 'msg:errors.invalid_input', resetKey: 0 });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('names the Search-budget reason when set-up is refused over budget (story 5.3)', async () => {
    addConnector.mockResolvedValueOnce({
      ok: false,
      error: {
        code: 'invalid_input',
        messageKey: 'errors.invalid_input',
        details: { projectKey: ['search_budget'] },
      },
    });
    const outcome = await addConnectorAction(
      INITIAL_CONNECTOR_ACTION,
      form({
        projectId: 'p1',
        spaceUrl: 'https://example.backlog.jp/',
        apiKey: 'k',
        projectKey: 'EC2',
        approvalName: 'A',
        approvalRecordedAt: '2026-09-01T00:00',
      }),
    );
    expect(outcome.error).toMatch(/25% of the API user's Search rate limit/);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('wires fields as UTC ISO and revalidates on success', async () => {
    addConnector.mockResolvedValueOnce({ ok: true, value: { id: 'con-1' } });
    const outcome = await addConnectorAction(
      INITIAL_CONNECTOR_ACTION,
      form({
        projectId: 'p1',
        spaceUrl: 'https://example.backlog.jp/',
        apiKey: 'secret',
        projectKey: 'EC2',
        approvalName: 'Client',
        approvalRecordedAt: '2026-09-01T15:00',
      }),
    );
    expect(outcome).toEqual({ error: null, resetKey: 1 });
    expect(addConnector).toHaveBeenCalledWith(
      {
        projectId: 'p1',
        spaceUrl: 'https://example.backlog.jp/',
        apiKey: 'secret',
        projectKey: 'EC2',
        approvalName: 'Client',
        approvalRecordedAt: '2026-09-01T15:00:00.000Z',
      },
      expect.anything(),
    );
    expect(revalidatePath).toHaveBeenCalledWith('/p/p1/connectors');
  });
});

describe('rotateCredentialsAction', () => {
  it('returns refuse and skips revalidate when the use case refuses', async () => {
    rotateCredentials.mockResolvedValueOnce({
      ok: false,
      error: { code: 'not_found', messageKey: 'errors.not_found' },
    });
    const outcome = await rotateCredentialsAction(
      INITIAL_CONNECTOR_ACTION,
      form({ projectId: 'p1', connectorId: 'c1', apiKey: 'k' }),
    );
    expect(outcome).toEqual({ error: 'msg:errors.not_found', resetKey: 0 });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('revalidates only when the write landed', async () => {
    rotateCredentials.mockResolvedValueOnce({ ok: true, value: undefined });
    const outcome = await rotateCredentialsAction(
      INITIAL_CONNECTOR_ACTION,
      form({ projectId: 'p1', connectorId: 'c1', apiKey: 'rotated' }),
    );
    expect(outcome).toEqual({ error: null, resetKey: 1 });
    expect(rotateCredentials).toHaveBeenCalledWith(
      { projectId: 'p1', connectorId: 'c1', apiKey: 'rotated' },
      expect.anything(),
    );
    expect(revalidatePath).toHaveBeenCalledWith('/p/p1/connectors');
  });
});
